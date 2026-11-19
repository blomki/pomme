import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  distribution,
  household,
  order,
  orderLine,
  orderPeriod,
  producer,
  product,
  referentAssignment,
  report,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { addDays, parisDay, periodInstants } from "@/domain/order-periods";
import {
  canReport,
  checkReport,
  MAX_REPORT_COMMENT_LENGTH,
  REPORT_REASONS,
  reportDeadline,
  type ReportProblem,
  type ReportReason,
  type ReportStatus,
} from "@/domain/reports";

import { writeAuditLog } from "./audit";
import { ForbiddenError } from "./auth/errors";
import { requireReferentOrAdmin } from "./auth/referent-or-admin";
import { requireRole } from "./auth/require-role";
import { myHousehold } from "./orders";

// Signalements (story F5, ADR 0024). La famille signale un produit manquant ou abîmé sur une
// distribution passée, jusqu'à la clôture des commandes qui suit ; l'admin reporte les écarts de
// la feuille d'émargement. Le référent du producteur, ou un admin, traite : avoir (F2) ou rejet.
// La Row Level Security limite aussi chaque lecture (le foyer, l'admin, le référent).

/** Distributions remontées au plus loin pour un signalement : environ quatre mois. */
const LOOKBACK_DAYS = 120;

export type ReportableLine = {
  orderLineId: string;
  householdId: string;
  distributionDate: string;
  productName: string;
  producerName: string;
  ordered: number;
  /** Quantité encore signalable : commandée moins déjà signalée (hors rejets). */
  reportable: number;
};

/** Lignes de commande signalables (distribution passée), d'un foyer ou de tous. */
async function linesOfPastDistributions(
  tx: Transaction,
  now: Date,
  filter: { householdId?: string; distributionId?: string },
): Promise<ReportableLine[]> {
  const today = parisDay(now);
  const rows = await tx
    .select({
      orderLineId: orderLine.id,
      householdId: order.householdId,
      distributionDate: distribution.date,
      productName: product.name,
      producerName: producer.name,
      ordered: orderLine.quantity,
    })
    .from(orderLine)
    .innerJoin(order, eq(order.id, orderLine.orderId))
    .innerJoin(distribution, eq(distribution.id, orderLine.distributionId))
    .innerJoin(catalogItem, eq(catalogItem.id, orderLine.catalogItemId))
    .innerJoin(product, eq(product.id, catalogItem.productId))
    .innerJoin(catalog, eq(catalog.id, order.catalogId))
    .innerJoin(producer, eq(producer.id, catalog.producerId))
    .where(
      and(
        sql`${orderLine.quantity} > 0`,
        lte(distribution.date, today),
        gte(distribution.date, addDays(today, -LOOKBACK_DAYS)),
        filter.householdId ? eq(order.householdId, filter.householdId) : undefined,
        filter.distributionId ? eq(distribution.id, filter.distributionId) : undefined,
      ),
    )
    .orderBy(desc(distribution.date), asc(producer.name), asc(product.name));
  const reported = await reportedQuantities(
    tx,
    rows.map((r) => r.orderLineId),
  );
  return rows.map((r) => ({ ...r, reportable: r.ordered - (reported.get(r.orderLineId) ?? 0) }));
}

/** Quantités déjà signalées par ligne (signalements ouverts ou crédités ; les rejets libèrent). */
async function reportedQuantities(tx: Transaction, orderLineIds: string[]) {
  if (orderLineIds.length === 0) return new Map<string, number>();
  const rows = await tx
    .select({
      orderLineId: report.orderLineId,
      total: sql<number>`sum(${report.quantity})::int`,
    })
    .from(report)
    .where(
      and(
        inArray(report.orderLineId, orderLineIds),
        ne(report.status, "rejected"),
        isNull(report.archivedAt),
      ),
    )
    .groupBy(report.orderLineId);
  return new Map(rows.map((r) => [r.orderLineId, r.total]));
}

/** Instants de clôture des périodes de l'AMAP (réelle si clôturée plus tôt par l'admin). */
async function closings(tx: Transaction): Promise<Date[]> {
  const rows = await tx
    .select({
      status: orderPeriod.status,
      closesAt: orderPeriod.closesAt,
      closedAt: orderPeriod.closedAt,
    })
    .from(orderPeriod);
  return rows.map((p) => (p.status === "closed" && p.closedAt ? p.closedAt : p.closesAt));
}

/** Lignes qu'une famille peut encore signaler : distribution passée, avant la clôture suivante. */
async function familyReportableLines(tx: Transaction, householdId: string, now: Date) {
  const lines = await linesOfPastDistributions(tx, now, { householdId });
  const allClosings = await closings(tx);
  const today = parisDay(now);
  return lines.filter(
    (l) =>
      l.reportable > 0 &&
      canReport({
        distributionDate: l.distributionDate,
        today,
        now,
        deadline: reportDeadline(
          periodInstants(l.distributionDate, l.distributionDate).closesAt,
          allClosings,
        ),
      }),
  );
}

export type ReportView = {
  id: string;
  householdName: string;
  distributionDate: string;
  productName: string;
  producerName: string;
  amapProducerId: string | null;
  quantity: number;
  unitPriceCents: number;
  reason: ReportReason;
  comment: string;
  source: "family" | "admin";
  status: ReportStatus;
  decisionNote: string;
  createdAt: Date;
};

/** Signalements visibles (la RLS filtre), avec de quoi les lire et les traiter. */
async function loadReports(
  tx: Transaction,
  where: Parameters<typeof and>[number],
  limit = 200,
): Promise<ReportView[]> {
  return (
    tx
      .select({
        id: report.id,
        householdName: household.name,
        distributionDate: distribution.date,
        productName: product.name,
        producerName: producer.name,
        amapProducerId: amapProducer.id,
        quantity: report.quantity,
        unitPriceCents: orderLine.unitPriceCents,
        reason: report.reason,
        comment: report.comment,
        source: report.source,
        status: report.status,
        decisionNote: report.decisionNote,
        createdAt: report.createdAt,
      })
      .from(report)
      .innerJoin(household, eq(household.id, report.householdId))
      .innerJoin(orderLine, eq(orderLine.id, report.orderLineId))
      .innerJoin(distribution, eq(distribution.id, orderLine.distributionId))
      .innerJoin(catalogItem, eq(catalogItem.id, orderLine.catalogItemId))
      .innerJoin(product, eq(product.id, catalogItem.productId))
      .innerJoin(order, eq(order.id, orderLine.orderId))
      .innerJoin(catalog, eq(catalog.id, order.catalogId))
      .innerJoin(producer, eq(producer.id, catalog.producerId))
      .leftJoin(amapProducer, eq(amapProducer.producerId, catalog.producerId))
      .where(and(isNull(report.archivedAt), where))
      // Ouverts d'abord, puis les plus récents.
      .orderBy(sql`${report.status} <> 'open'`, desc(report.createdAt))
      .limit(limit)
  );
}

// --- Famille (écran 6) -------------------------------------------------------------------------

export type FamilyReports =
  { state: "no_household" } | { state: "ready"; lines: ReportableLine[]; reports: ReportView[] };

/** Écran « Signaler un problème » : lignes signalables et signalements du foyer. */
export async function getFamilyReports(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<FamilyReports> {
  const home = await myHousehold(tx, ctx);
  if (!home) return { state: "no_household" };
  return {
    state: "ready",
    lines: await familyReportableLines(tx, home.id, now),
    reports: await loadReports(tx, eq(report.householdId, home.id), 50),
  };
}

const reportSchema = z.object({
  orderLineId: z.uuid(),
  quantity: z.number().int(),
  reason: z.enum(REPORT_REASONS),
  comment: z.string().max(MAX_REPORT_COMMENT_LENGTH * 2),
});

export type CreateReportResult =
  | { status: "created"; id: string }
  | { status: "invalid"; problems: ReportProblem[] }
  | { status: "not_reportable" } // ligne inconnue, d'un autre foyer, ou délai passé
  | { status: "no_household" };

/** La famille signale un problème sur une de ses lignes de commande. */
export async function createFamilyReport(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<CreateReportResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", problems: [] };
  const home = await myHousehold(tx, ctx);
  if (!home) return { status: "no_household" };
  const line = (await familyReportableLines(tx, home.id, now)).find(
    (l) => l.orderLineId === parsed.data.orderLineId,
  );
  if (!line) return { status: "not_reportable" };
  return insertReport(tx, ctx, line, parsed.data, "family");
}

async function insertReport(
  tx: Transaction,
  ctx: AmapContext,
  line: ReportableLine,
  input: z.infer<typeof reportSchema>,
  source: "family" | "admin",
): Promise<CreateReportResult> {
  const problems = checkReport({
    reason: input.reason,
    comment: input.comment,
    quantity: input.quantity,
    ordered: line.ordered,
    alreadyReported: line.ordered - line.reportable,
  });
  if (problems.length > 0) return { status: "invalid", problems };
  const id = uuidv7();
  const values = {
    id,
    amapId: ctx.amapId!,
    householdId: line.householdId,
    orderLineId: line.orderLineId,
    quantity: input.quantity,
    reason: input.reason,
    comment: input.comment.trim(),
    source,
    createdBy: ctx.userId,
  };
  await tx.insert(report).values(values);
  await writeAuditLog(tx, ctx, {
    entityType: "report",
    entityId: id,
    action: "create",
    after: values,
  });
  return { status: "created", id };
}

// --- Admin : écarts de la feuille d'émargement (écran A5) -------------------------------------

export type AdminReportForm = {
  distributions: Array<{ id: string; date: string }>;
  /** Foyers servis à la distribution choisie, avec leurs lignes. */
  households: Array<{ id: string; name: string; lines: ReportableLine[] }>;
};

/**
 * Formulaire de l'admin : distributions passées (quatre mois), puis, pour celle choisie, les
 * foyers et leurs lignes. Pas de délai pour l'admin : la feuille arrive après la distribution.
 */
export async function getAdminReportForm(
  tx: Transaction,
  ctx: AmapContext,
  input: { distributionId?: string },
  now = new Date(),
): Promise<AdminReportForm> {
  await requireRole(tx, ctx, ["admin"]);
  const today = parisDay(now);
  const distributions = await tx
    .select({ id: distribution.id, date: distribution.date })
    .from(distribution)
    .where(
      and(
        lte(distribution.date, today),
        gte(distribution.date, addDays(today, -LOOKBACK_DAYS)),
        eq(distribution.isOpen, true),
      ),
    )
    .orderBy(desc(distribution.date));
  const chosen = distributions.find((d) => d.id === input.distributionId);
  if (!chosen) return { distributions, households: [] };
  const lines = (await linesOfPastDistributions(tx, now, { distributionId: chosen.id })).filter(
    (l) => l.reportable > 0,
  );
  const ids = [...new Set(lines.map((l) => l.householdId))];
  const names = ids.length
    ? await tx
        .select({ id: household.id, name: household.name })
        .from(household)
        .where(inArray(household.id, ids))
        .orderBy(asc(sql`lower(${household.name})`))
    : [];
  return {
    distributions,
    households: names.map((h) => ({
      ...h,
      lines: lines.filter((l) => l.householdId === h.id),
    })),
  };
}

/** L'admin reporte un écart de la feuille d'émargement. */
export async function createAdminReport(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<CreateReportResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", problems: [] };
  const [target] = await tx
    .select({ distributionId: orderLine.distributionId })
    .from(orderLine)
    .where(eq(orderLine.id, parsed.data.orderLineId));
  if (!target) return { status: "not_reportable" };
  const line = (
    await linesOfPastDistributions(tx, now, { distributionId: target.distributionId })
  ).find((l) => l.orderLineId === parsed.data.orderLineId);
  if (!line) return { status: "not_reportable" };
  return insertReport(tx, ctx, line, parsed.data, "admin");
}

// --- Traitement : référent du producteur ou admin --------------------------------------------

/** Signalements de tous les producteurs de l'AMAP (admin). */
export async function listAllReports(tx: Transaction, ctx: AmapContext): Promise<ReportView[]> {
  await requireRole(tx, ctx, ["admin"]);
  return loadReports(tx, undefined);
}

/** Signalements des producteurs que le référent suit. */
export async function listMyProducersReports(
  tx: Transaction,
  ctx: AmapContext,
): Promise<ReportView[]> {
  await requireRole(tx, ctx, ["referent"]);
  const followed = await tx
    .select({ producerId: amapProducer.producerId })
    .from(referentAssignment)
    .innerJoin(amapProducer, eq(amapProducer.id, referentAssignment.amapProducerId))
    .where(eq(referentAssignment.userId, ctx.userId!));
  if (followed.length === 0) return [];
  return loadReports(
    tx,
    inArray(
      catalog.producerId,
      followed.map((f) => f.producerId),
    ),
  );
}

/** Nombre de signalements ouverts : tâche « Bloquant » du tableau de bord de l'admin. */
export async function countOpenReports(tx: Transaction): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(report)
    .where(and(eq(report.status, "open"), isNull(report.archivedAt)));
  return row?.count ?? 0;
}

const rejectSchema = z.object({
  reportId: z.uuid(),
  note: z.string().trim().min(1).max(MAX_REPORT_COMMENT_LENGTH),
});

export type DecideReportResult =
  | { status: "rejected" }
  | { status: "not_found" }
  | { status: "already_decided" }
  | { status: "invalid" };

/** Le producteur de la ligne signalée, dans l'AMAP courante (pour vérifier le droit). */
export async function amapProducerOfReport(tx: Transaction, reportId: string) {
  const [row] = await tx
    .select({
      amapProducerId: amapProducer.id,
      producerId: catalog.producerId,
      householdId: report.householdId,
      status: report.status,
      reason: report.reason,
      quantity: report.quantity,
      unitPriceCents: orderLine.unitPriceCents,
      decisionNote: report.decisionNote,
    })
    .from(report)
    .innerJoin(orderLine, eq(orderLine.id, report.orderLineId))
    .innerJoin(order, eq(order.id, orderLine.orderId))
    .innerJoin(catalog, eq(catalog.id, order.catalogId))
    .innerJoin(amapProducer, eq(amapProducer.producerId, catalog.producerId))
    .where(and(eq(report.id, reportId), isNull(report.archivedAt)));
  return row ?? null;
}

/**
 * Rejette un signalement, avec un motif montré à la famille. Le référent du producteur ou un
 * admin (deuxième vérification). Journalisé.
 */
export async function rejectReport(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<DecideReportResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const target = await amapProducerOfReport(tx, parsed.data.reportId);
  if (!target) return { status: "not_found" };
  await requireReferentOrAdmin(tx, ctx, target.amapProducerId);
  if (target.status !== "open") return { status: "already_decided" };
  const updated = await tx
    .update(report)
    .set({
      status: "rejected",
      decisionNote: parsed.data.note,
      decidedAt: now,
      decidedBy: ctx.userId,
    })
    .where(and(eq(report.id, parsed.data.reportId), eq(report.status, "open")))
    .returning({ id: report.id });
  if (updated.length === 0) throw new ForbiddenError();
  await writeAuditLog(tx, ctx, {
    entityType: "report",
    entityId: parsed.data.reportId,
    action: "reject",
    before: { status: "open" },
    after: { status: "rejected", decisionNote: parsed.data.note },
  });
  return { status: "rejected" };
}
