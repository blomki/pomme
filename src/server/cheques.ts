import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapProducer, cheque, household, orderPeriod } from "@/db/schema";
import { cleanChequeNumber, type ChequeStatus } from "@/domain/cheques";
import { parisDay } from "@/domain/order-periods";

import { writeAuditLog } from "./audit";
import { requireReferentOrAdmin } from "./auth/referent-or-admin";

// Pointage des chèques (story F1, ADR 0023) : le référent du producteur (ou un admin, avec la
// deuxième vérification) coche « Reçu », corrige le montant, note le numéro, traite les écarts.
// Chaque changement est écrit dans le journal. Un chèque pointé verrouille la commande du foyer
// chez ce producteur (orders.ts, cellLock), y compris après une réouverture.

export type PointageRow = {
  id: string;
  householdName: string;
  status: ChequeStatus;
  grossCents: number;
  creditsCents: number;
  expectedCents: number;
  receivedCents: number | null;
  chequeNumber: string | null;
  gapSettledAt: Date | null;
};

export type ChequePointage = {
  amapProducerId: string;
  producerName: string;
  month: string;
  /** Période du mois, ou null : pas de période, donc pas de chèque. */
  periodStatus: "scheduled" | "open" | "closed" | null;
  cheques: PointageRow[];
};

/** Chèques d'un producteur pour un mois, par nom de foyer. */
export async function getChequePointage(
  tx: Transaction,
  ctx: AmapContext,
  input: { amapProducerId: string; month: string },
): Promise<ChequePointage> {
  const target = await requireReferentOrAdmin(tx, ctx, input.amapProducerId);
  const [period] = await tx
    .select({ id: orderPeriod.id, status: orderPeriod.status })
    .from(orderPeriod)
    .where(eq(orderPeriod.month, `${input.month}-01`));
  const rows = period
    ? await tx
        .select({
          id: cheque.id,
          householdName: household.name,
          status: cheque.status,
          grossCents: cheque.grossCents,
          creditsCents: cheque.creditsCents,
          expectedCents: cheque.expectedCents,
          receivedCents: cheque.receivedCents,
          chequeNumber: cheque.chequeNumber,
          gapSettledAt: cheque.gapSettledAt,
        })
        .from(cheque)
        .innerJoin(household, eq(household.id, cheque.householdId))
        .where(
          and(
            eq(cheque.orderPeriodId, period.id),
            eq(cheque.producerId, target.producerId),
            isNull(cheque.archivedAt),
          ),
        )
        .orderBy(asc(sql`lower(${household.name})`))
    : [];
  return {
    amapProducerId: target.amapProducerId,
    producerName: target.producerName,
    month: input.month,
    periodStatus: period?.status ?? null,
    cheques: rows,
  };
}

/**
 * Mois proposé par défaut : celui de la dernière période clôturée (ses chèques arrivent), sinon
 * le mois en cours.
 */
export async function defaultChequeMonth(tx: Transaction, now = new Date()): Promise<string> {
  const [last] = await tx
    .select({ month: orderPeriod.month })
    .from(orderPeriod)
    .where(eq(orderPeriod.status, "closed"))
    .orderBy(desc(orderPeriod.month))
    .limit(1);
  return last ? last.month.slice(0, 7) : parisDay(now).slice(0, 7);
}

/** Chèque de l'AMAP courante et droit d'y toucher (référent de son producteur, ou admin). */
async function loadForPointage(tx: Transaction, ctx: AmapContext, chequeId: string) {
  if (!z.uuid().safeParse(chequeId).success) return null;
  const [row] = await tx.select().from(cheque).where(eq(cheque.id, chequeId));
  if (!row || row.archivedAt) return null;
  const [link] = await tx
    .select({ id: amapProducer.id })
    .from(amapProducer)
    .where(eq(amapProducer.producerId, row.producerId));
  if (!link) return null;
  await requireReferentOrAdmin(tx, ctx, link.id);
  return row;
}

/** Ce que le journal garde d'un chèque, avant et après un pointage. */
const journalView = (c: {
  status: ChequeStatus;
  receivedCents: number | null;
  chequeNumber: string | null;
  gapSettledAt: Date | null;
}) => ({
  status: c.status,
  receivedCents: c.receivedCents,
  chequeNumber: c.chequeNumber,
  gapSettled: c.gapSettledAt !== null,
});

const receiveSchema = z.object({
  chequeId: z.string(),
  // Absent : le montant attendu. Positif, 10 000 € au plus.
  receivedCents: z.number().int().positive().max(1_000_000).optional(),
  chequeNumber: z.string().optional(),
});

export type PointageResult =
  | { status: "saved"; cheque: PointageRow }
  | { status: "not_found" } // chèque inconnu, archivé, ou d'une autre AMAP
  | { status: "handed_over" } // déjà remis au producteur (F3) : plus de changement
  | { status: "invalid" }; // montant ou numéro non valable

const rowOf = (c: typeof cheque.$inferSelect, householdName: string): PointageRow => ({
  id: c.id,
  householdName,
  status: c.status,
  grossCents: c.grossCents,
  creditsCents: c.creditsCents,
  expectedCents: c.expectedCents,
  receivedCents: c.receivedCents,
  chequeNumber: c.chequeNumber,
  gapSettledAt: c.gapSettledAt,
});

async function householdNameOf(tx: Transaction, householdId: string) {
  const [row] = await tx
    .select({ name: household.name })
    .from(household)
    .where(eq(household.id, householdId));
  return row?.name ?? "";
}

/**
 * Pointe un chèque reçu, ou corrige son montant ou son numéro. Sans montant : le montant attendu.
 * Un nouveau montant rouvre l'écart éventuel : il doit être traité de nouveau.
 */
export async function markChequeReceived(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<PointageResult> {
  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const before = await loadForPointage(tx, ctx, parsed.data.chequeId);
  if (!before) return { status: "not_found" };
  if (before.status === "handed_over") return { status: "handed_over" };

  const number =
    parsed.data.chequeNumber === undefined
      ? before.chequeNumber
      : cleanChequeNumber(parsed.data.chequeNumber);
  if (number === undefined) return { status: "invalid" };
  const receivedCents = parsed.data.receivedCents ?? before.receivedCents ?? before.expectedCents;
  const amountChanged = receivedCents !== before.receivedCents;

  const [after] = await tx
    .update(cheque)
    .set({
      status: "received",
      receivedCents,
      chequeNumber: number,
      // Date et auteur du pointage : ceux du premier « Reçu ».
      ...(before.status === "expected" ? { receivedAt: now, receivedBy: ctx.userId } : {}),
      ...(amountChanged ? { gapSettledAt: null, gapSettledBy: null } : {}),
    })
    .where(eq(cheque.id, before.id))
    .returning();
  await writeAuditLog(tx, ctx, {
    entityType: "cheque",
    entityId: before.id,
    action: before.status === "expected" ? "mark_received" : "update_received",
    before: journalView(before),
    after: journalView(after!),
  });
  return { status: "saved", cheque: rowOf(after!, await householdNameOf(tx, before.householdId)) };
}

/** Annule le pointage (coché par erreur) : le chèque redevient attendu. */
export async function unmarkChequeReceived(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<PointageResult> {
  const parsed = z.object({ chequeId: z.string() }).safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const before = await loadForPointage(tx, ctx, parsed.data.chequeId);
  if (!before) return { status: "not_found" };
  if (before.status === "handed_over") return { status: "handed_over" };
  if (before.status === "expected") {
    return {
      status: "saved",
      cheque: rowOf(before, await householdNameOf(tx, before.householdId)),
    };
  }
  const [after] = await tx
    .update(cheque)
    .set({
      status: "expected",
      receivedCents: null,
      receivedAt: null,
      receivedBy: null,
      chequeNumber: null,
      gapSettledAt: null,
      gapSettledBy: null,
    })
    .where(eq(cheque.id, before.id))
    .returning();
  await writeAuditLog(tx, ctx, {
    entityType: "cheque",
    entityId: before.id,
    action: "unmark_received",
    before: journalView(before),
    after: journalView(after!),
  });
  return { status: "saved", cheque: rowOf(after!, await householdNameOf(tx, before.householdId)) };
}

/**
 * Marque l'écart d'un chèque comme traité (complément reçu, avoir prévu…), ou de nouveau à
 * traiter. Seulement pour un chèque reçu dont le montant diffère de l'attendu.
 */
export async function settleChequeGap(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<PointageResult | { status: "no_gap" }> {
  const parsed = z.object({ chequeId: z.string(), settled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const before = await loadForPointage(tx, ctx, parsed.data.chequeId);
  if (!before) return { status: "not_found" };
  if (
    before.status === "expected" ||
    before.receivedCents === null ||
    before.receivedCents === before.expectedCents
  ) {
    return { status: "no_gap" };
  }
  const [after] = await tx
    .update(cheque)
    .set(
      parsed.data.settled
        ? { gapSettledAt: now, gapSettledBy: ctx.userId }
        : { gapSettledAt: null, gapSettledBy: null },
    )
    .where(eq(cheque.id, before.id))
    .returning();
  await writeAuditLog(tx, ctx, {
    entityType: "cheque",
    entityId: before.id,
    action: parsed.data.settled ? "settle_gap" : "reopen_gap",
    before: journalView(before),
    after: journalView(after!),
  });
  return { status: "saved", cheque: rowOf(after!, await householdNameOf(tx, before.householdId)) };
}
