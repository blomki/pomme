import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amapProducer,
  catalogItem,
  cheque,
  credit,
  distribution,
  household,
  orderLine,
  orderPeriod,
  producer,
  product,
  referentAssignment,
  report,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { checkCredit, type CreditProblem } from "@/domain/credits";
import type { ReportReason } from "@/domain/reports";

import { writeAuditLog } from "./audit";
import { requireReferentOrAdmin } from "./auth/referent-or-admin";
import { requireRole } from "./auth/require-role";
import { amapProducerOfReport } from "./reports";

// Avoirs (story F2, ADR 0025). Le référent du producteur, ou un admin, crée un avoir à partir
// d'un signalement ouvert : le signalement devient « crédité ». L'avoir est déduit du chèque du
// foyer chez ce producteur à la clôture suivante où il commande (order-periods.ts). Journalisé.

const creditSchema = z.object({
  reportId: z.uuid(),
  amountCents: z.number(),
  pickedUp: z.boolean().default(false),
});

export type CreditFromReportResult =
  | { status: "credited"; creditId: string }
  | { status: "invalid"; problems: CreditProblem[] }
  | { status: "not_found" }
  | { status: "already_decided" };

/** Crée l'avoir d'un signalement ouvert, du montant choisi par le référent. */
export async function creditFromReport(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<CreditFromReportResult> {
  const parsed = creditSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", problems: [] };
  const target = await amapProducerOfReport(tx, parsed.data.reportId);
  if (!target) return { status: "not_found" };
  await requireReferentOrAdmin(tx, ctx, target.amapProducerId);
  if (target.status !== "open") return { status: "already_decided" };
  const problems = checkCredit({
    amountCents: parsed.data.amountCents,
    reason: target.reason,
    pickedUp: parsed.data.pickedUp,
  });
  if (problems.length > 0) return { status: "invalid", problems };

  const creditId = uuidv7();
  const values = {
    id: creditId,
    amapId: ctx.amapId!,
    householdId: target.householdId,
    producerId: target.producerId,
    amountCents: parsed.data.amountCents,
    reportId: parsed.data.reportId,
    createdBy: ctx.userId,
  };
  await tx.insert(credit).values(values);
  await tx
    .update(report)
    .set({ status: "credited", decidedAt: now, decidedBy: ctx.userId })
    .where(and(eq(report.id, parsed.data.reportId), eq(report.status, "open")));
  await writeAuditLog(tx, ctx, {
    entityType: "credit",
    entityId: creditId,
    action: "create",
    after: values,
  });
  await writeAuditLog(tx, ctx, {
    entityType: "report",
    entityId: parsed.data.reportId,
    action: "credit",
    before: { status: "open" },
    after: { status: "credited", creditId },
  });
  return { status: "credited", creditId };
}

export type CreditView = {
  id: string;
  householdId: string;
  householdName: string;
  producerName: string;
  amountCents: number;
  status: "created" | "deducted";
  createdAt: Date;
  /** Mois du chèque dont il a été déduit (« 2026-12 »), ou null s'il attend. */
  deductedMonth: string | null;
  /** Reste d'un avoir plus grand que la commande, reporté. */
  isRemainder: boolean;
  /** Signalement d'origine, ou null pour un reste. */
  source: { productName: string; distributionDate: string; reason: ReportReason } | null;
};

/** Historique des avoirs, les plus récents d'abord (la RLS filtre aussi). */
async function loadCredits(
  tx: Transaction,
  where: Parameters<typeof and>[number],
): Promise<CreditView[]> {
  const rows = await tx
    .select({
      id: credit.id,
      householdId: credit.householdId,
      householdName: household.name,
      producerName: producer.name,
      amountCents: credit.amountCents,
      status: credit.status,
      createdAt: credit.createdAt,
      splitFromCreditId: credit.splitFromCreditId,
      periodMonth: orderPeriod.month,
      productName: product.name,
      distributionDate: distribution.date,
      reason: report.reason,
    })
    .from(credit)
    .innerJoin(household, eq(household.id, credit.householdId))
    .innerJoin(producer, eq(producer.id, credit.producerId))
    .leftJoin(cheque, eq(cheque.id, credit.deductedOnChequeId))
    .leftJoin(orderPeriod, eq(orderPeriod.id, cheque.orderPeriodId))
    .leftJoin(report, eq(report.id, credit.reportId))
    .leftJoin(orderLine, eq(orderLine.id, report.orderLineId))
    .leftJoin(catalogItem, eq(catalogItem.id, orderLine.catalogItemId))
    .leftJoin(product, eq(product.id, catalogItem.productId))
    .leftJoin(distribution, eq(distribution.id, orderLine.distributionId))
    .where(and(isNull(credit.archivedAt), where))
    .orderBy(desc(credit.createdAt), asc(household.name))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    householdId: r.householdId,
    householdName: r.householdName,
    producerName: r.producerName,
    amountCents: r.amountCents,
    status: r.status,
    createdAt: r.createdAt,
    deductedMonth: r.periodMonth ? r.periodMonth.slice(0, 7) : null,
    isRemainder: r.splitFromCreditId !== null,
    source:
      r.productName && r.distributionDate && r.reason
        ? { productName: r.productName, distributionDate: r.distributionDate, reason: r.reason }
        : null,
  }));
}

/**
 * Avoirs d'un producteur, pour « Mes paiements » (F4). Sans contrôle d'accès : l'appelant a
 * déjà vérifié le droit (requireCatalogEditor). Le signalement d'origine reste caché au
 * producteur (la RLS ne le lui montre pas) : source vaut alors null.
 */
export function listProducerCredits(tx: Transaction, producerId: string): Promise<CreditView[]> {
  return loadCredits(tx, eq(credit.producerId, producerId));
}

/** Avoirs de tous les producteurs de l'AMAP (admin). */
export async function listAllCredits(tx: Transaction, ctx: AmapContext): Promise<CreditView[]> {
  await requireRole(tx, ctx, ["admin"]);
  return loadCredits(tx, undefined);
}

/** Avoirs des producteurs que le référent suit. */
export async function listMyProducersCredits(
  tx: Transaction,
  ctx: AmapContext,
): Promise<CreditView[]> {
  await requireRole(tx, ctx, ["referent"]);
  const followed = await tx
    .select({ producerId: amapProducer.producerId })
    .from(referentAssignment)
    .innerJoin(amapProducer, eq(amapProducer.id, referentAssignment.amapProducerId))
    .where(eq(referentAssignment.userId, ctx.userId!));
  if (followed.length === 0) return [];
  return loadCredits(
    tx,
    inArray(
      credit.producerId,
      followed.map((f) => f.producerId),
    ),
  );
}
