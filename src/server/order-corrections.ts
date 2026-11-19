import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { household } from "@/db/schema";
import { correctionChangesQuantity } from "@/domain/orders";

import { writeAuditLog } from "./audit";
import { requireReferentOrAdmin } from "./auth/referent-or-admin";
import { requireRole } from "./auth/require-role";
import { hasActiveMembership } from "./memberships";
import {
  loadHouseholdOrder,
  openPeriod,
  quantitiesSchema,
  quantitySchema,
  writeQuantity,
  type OrderProducer,
  type SetQuantityResult,
} from "./orders";

// Correction de la commande d'un foyer par un référent ou un admin (story D7, ADR 0020).
// Le référent corrige chez les producteurs qu'il suit, l'admin chez tous. Mêmes contrôles que la
// saisie de la famille (orders.ts : writeQuantity), sauf l'adhésion ; seulement pendant que la
// période est ouverte (une période clôturée se rouvre d'abord, D2). Chaque correction qui change
// une quantité est écrite dans le journal.

/** Le compte peut corriger les commandes de ce producteur (règle commune, voir l'import). */
export const requireOrderCorrector = requireReferentOrAdmin;

/** Foyer non archivé de l'AMAP courante (la Row Level Security limite à l'AMAP), ou null. */
async function findHousehold(
  tx: Transaction,
  householdId: string,
): Promise<{ id: string; name: string } | null> {
  if (!z.uuid().safeParse(householdId).success) return null;
  const [row] = await tx
    .select({ id: household.id, name: household.name })
    .from(household)
    .where(and(eq(household.id, householdId), isNull(household.archivedAt)));
  return row ?? null;
}

/** Foyers non archivés de l'AMAP, par nom : pour choisir quelle commande corriger. */
export async function listCorrectableHouseholds(
  tx: Transaction,
  ctx: AmapContext,
  amapProducerId: string,
): Promise<Array<{ id: string; name: string }>> {
  await requireOrderCorrector(tx, ctx, amapProducerId);
  return tx
    .select({ id: household.id, name: household.name })
    .from(household)
    .where(isNull(household.archivedAt))
    .orderBy(asc(sql`lower(${household.name})`));
}

export type OrderCorrection =
  | { state: "not_found" }
  | { state: "not_open" }
  | {
      state: "open";
      household: { id: string; name: string };
      month: string;
      closesOn: string;
      membershipActive: boolean;
      distributions: Array<{ id: string; date: string }>;
      /** null : pas de catalogue publié de ce producteur pour le mois. */
      producer: OrderProducer | null;
    };

/** Commande d'un foyer chez un producteur, pour la corriger. */
export async function getOrderCorrection(
  tx: Transaction,
  ctx: AmapContext,
  input: { householdId: string; amapProducerId: string },
  now = new Date(),
): Promise<OrderCorrection> {
  const target = await requireOrderCorrector(tx, ctx, input.amapProducerId);
  const home = await findHousehold(tx, input.householdId);
  if (!home) return { state: "not_found" };
  const period = await openPeriod(tx, now);
  if (!period) return { state: "not_open" };
  const { distributions, producers } = await loadHouseholdOrder(
    tx,
    home.id,
    period,
    now,
    target.producerId,
  );
  return {
    state: "open",
    household: home,
    month: period.month,
    closesOn: period.closesOn,
    membershipActive: await hasActiveMembership(tx, home.id, now),
    distributions,
    producer: producers[0] ?? null,
  };
}

const correctionSchema = z.object({
  householdId: z.uuid(),
  amapProducerId: z.uuid(),
});

export type CorrectionResult =
  | SetQuantityResult
  | { status: "not_found" } // foyer inconnu ou archivé
  | { status: "closed" };

/**
 * Corrige une quantité de la commande d'un foyer. Le prix est celui du catalogue au moment de
 * la correction (ADR 0018, point 4). Le journal garde qui, quand, le foyer, le produit, la
 * distribution, et la quantité avant et après.
 */
export async function correctOrderQuantity(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<CorrectionResult> {
  const who = correctionSchema.safeParse(input);
  const line = quantitySchema.safeParse(input);
  if (!who.success || !line.success) return { status: "invalid" };
  const target = await requireOrderCorrector(tx, ctx, who.data.amapProducerId);
  const home = await findHousehold(tx, who.data.householdId);
  if (!home) return { status: "not_found" };
  const period = await openPeriod(tx, now);
  if (!period) return { status: "closed" };

  const written = await writeQuantity(tx, ctx, home.id, period, line.data, now, target.producerId);
  if (written.status !== "saved") return written;
  if (correctionChangesQuantity(written.before.quantity, written.result.quantity)) {
    await writeAuditLog(tx, ctx, {
      entityType: "order",
      entityId: written.orderId,
      action: "correct",
      before: {
        householdId: home.id,
        catalogItemId: line.data.catalogItemId,
        distributionId: line.data.distributionId,
        ...written.before,
      },
      after: {
        householdId: home.id,
        catalogItemId: line.data.catalogItemId,
        distributionId: line.data.distributionId,
        quantity: written.result.quantity,
        unitPriceCents: written.result.unitPriceCents,
      },
    });
  }
  return written.result;
}

/** Plusieurs corrections d'un coup (« Même quantité chaque semaine »), dans l'ordre. */
export async function correctOrderQuantities(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<CorrectionResult[] | { status: "invalid" }> {
  const who = correctionSchema.safeParse(input);
  const parsed = quantitiesSchema.safeParse(input);
  if (!who.success || !parsed.success) return { status: "invalid" };
  const results: CorrectionResult[] = [];
  for (const line of parsed.data.lines) {
    const fields = typeof line === "object" && line !== null ? line : {};
    results.push(await correctOrderQuantity(tx, ctx, { ...fields, ...who.data }, now));
  }
  return results;
}

export type HouseholdOrderOverview =
  | { state: "not_open" }
  | {
      state: "open";
      month: string;
      closesOn: string;
      producers: Array<{
        amapProducerId: string;
        name: string;
        status: OrderProducer["status"];
        totalCents: number;
      }>;
    };

/**
 * Commande du mois d'un foyer, producteur par producteur, sur sa fiche (admin) : chaque
 * producteur mène à l'écran de correction. Admin seulement : il corrige chez tous.
 */
export async function getHouseholdOrderOverview(
  tx: Transaction,
  ctx: AmapContext,
  householdId: string,
  now = new Date(),
): Promise<HouseholdOrderOverview> {
  await requireRole(tx, ctx, ["admin"]);
  const period = await openPeriod(tx, now);
  if (!period) return { state: "not_open" };
  const { producers } = await loadHouseholdOrder(tx, householdId, period, now);
  return {
    state: "open",
    month: period.month,
    closesOn: period.closesOn,
    producers: producers.map((p) => ({
      amapProducerId: p.amapProducerId,
      name: p.name,
      status: p.status,
      totalCents: p.totalCents,
    })),
  };
}
