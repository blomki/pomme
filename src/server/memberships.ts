import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amap, household, membership } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import {
  checkMembershipInput,
  coversDay,
  MEMBERSHIP_EXPIRY_ALERT_DAYS,
  membershipState,
  type MembershipInputError,
  type MembershipState,
} from "@/domain/memberships";
import { parisDay } from "@/domain/order-periods";

import { requireRole } from "./auth/require-role";
import { writeAuditLog } from "./audit";
import { exclusionViolation } from "./db-errors";

// Adhésions des foyers (story B1). Saisie réservée aux admins de l'AMAP (requireRole) ; la Row
// Level Security limite chaque requête à l'AMAP courante. Toute saisie est journalisée : la
// cotisation est une donnée financière.

export type MembershipView = {
  id: string;
  startDate: string;
  endDate: string;
  feeCents: number | null;
  note: string;
};

const membershipColumns = {
  id: membership.id,
  startDate: membership.startDate,
  endDate: membership.endDate,
  feeCents: membership.feeCents,
  note: membership.note,
};

/** Délai d'alerte « expire bientôt » de l'AMAP courante (réglage, 30 jours par défaut). */
export async function expiryAlertDays(tx: Transaction, ctx: AmapContext): Promise<number> {
  const [row] = await tx
    .select({ settings: amap.settings })
    .from(amap)
    .where(eq(amap.id, ctx.amapId!));
  const days = row?.settings.membershipExpiryAlertDays;
  return Number.isInteger(days) && days! > 0 ? days! : MEMBERSHIP_EXPIRY_ALERT_DAYS;
}

/** Adhésions d'un foyer (non archivées), de la plus récente à la plus ancienne. */
export async function listMemberships(
  tx: Transaction,
  ctx: AmapContext,
  householdId: string,
): Promise<MembershipView[]> {
  await requireRole(tx, ctx, ["admin"]);
  if (!z.uuid().safeParse(householdId).success) return [];
  return tx
    .select(membershipColumns)
    .from(membership)
    .where(and(eq(membership.householdId, householdId), isNull(membership.archivedAt)))
    .orderBy(desc(membership.startDate));
}

/**
 * Statut d'adhésion de chaque foyer demandé, au jour de Paris de `now`. Un foyer sans
 * adhésion a le statut « aucune ». Pas de contrôle de rôle : l'appelant l'a déjà fait.
 */
export async function membershipStates(
  tx: Transaction,
  ctx: AmapContext,
  householdIds: readonly string[],
  now = new Date(),
): Promise<Map<string, MembershipState>> {
  const rows =
    householdIds.length === 0
      ? []
      : await tx
          .select({
            householdId: membership.householdId,
            startDate: membership.startDate,
            endDate: membership.endDate,
          })
          .from(membership)
          .where(
            and(inArray(membership.householdId, [...householdIds]), isNull(membership.archivedAt)),
          );
  const alertDays = await expiryAlertDays(tx, ctx);
  const today = parisDay(now);
  return new Map(
    householdIds.map((id) => [
      id,
      membershipState(
        rows.filter((r) => r.householdId === id),
        today,
        alertDays,
      ),
    ]),
  );
}

/**
 * Le foyer est-il adhérent au jour de Paris de `now` ? Contrôle serveur de la commande
 * (story D3) : un foyer sans adhésion en cours ne peut pas commander.
 */
export async function hasActiveMembership(
  tx: Transaction,
  householdId: string,
  now = new Date(),
): Promise<boolean> {
  const rows = await tx
    .select({ startDate: membership.startDate, endDate: membership.endDate })
    .from(membership)
    .where(and(eq(membership.householdId, householdId), isNull(membership.archivedAt)));
  return coversDay(rows, parisDay(now));
}

const saveSchema = z.object({
  householdId: z.uuid(),
  /** Absent : nouvelle adhésion ; présent : modification. */
  id: z.uuid().optional(),
  startDate: z.string().max(20),
  endDate: z.string().max(20),
  fee: z.string().max(20).default(""),
  note: z.string().trim().max(500).default(""),
});

export type SaveMembershipResult =
  | { status: "saved"; id: string }
  | { status: "invalid"; errors: MembershipInputError[] }
  | { status: "overlap" }
  | { status: "not_found" };

/** Ajoute ou modifie une adhésion d'un foyer actif. */
export async function saveMembership(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveMembershipResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { status: "not_found" };
  const { householdId, id, note } = parsed.data;
  const checked = checkMembershipInput(parsed.data);
  if (!checked.ok) return { status: "invalid", errors: checked.errors };

  const [target] = await tx
    .select({ archivedAt: household.archivedAt })
    .from(household)
    .where(eq(household.id, householdId));
  if (!target || target.archivedAt) return { status: "not_found" };

  const values = {
    startDate: checked.startDate,
    endDate: checked.endDate,
    feeCents: checked.feeCents,
    note,
  };
  let before: MembershipView | undefined;
  if (id) {
    [before] = await tx
      .select(membershipColumns)
      .from(membership)
      .where(
        and(
          eq(membership.id, id),
          eq(membership.householdId, householdId),
          isNull(membership.archivedAt),
        ),
      );
    if (!before) return { status: "not_found" };
  }

  const membershipId = id ?? uuidv7();
  try {
    // Sous-transaction : si la base refuse (chevauchement), la transaction principale reste
    // utilisable et on renvoie un message clair.
    await tx.transaction(async (sub) => {
      if (id) {
        await sub.update(membership).set(values).where(eq(membership.id, id));
      } else {
        await sub.insert(membership).values({
          id: membershipId,
          amapId: ctx.amapId!,
          householdId,
          createdBy: ctx.userId,
          ...values,
        });
      }
    });
  } catch (error) {
    if (exclusionViolation(error) === "membership_no_overlap") return { status: "overlap" };
    throw error;
  }

  await writeAuditLog(tx, ctx, {
    entityType: "membership",
    entityId: membershipId,
    action: id ? "update" : "create",
    before,
    after: { householdId, ...values },
  });
  return { status: "saved", id: membershipId };
}

/**
 * Archive une adhésion saisie par erreur (jamais supprimée). Elle ne compte plus dans le
 * statut et libère ses dates.
 */
export async function archiveMembership(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<{ status: "archived" } | { status: "not_found" }> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { status: "not_found" };
  const [row] = await tx
    .update(membership)
    .set({ archivedAt: new Date() })
    .where(and(eq(membership.id, parsed.data.id), isNull(membership.archivedAt)))
    .returning(membershipColumns);
  if (!row) return { status: "not_found" };
  await writeAuditLog(tx, ctx, {
    entityType: "membership",
    entityId: row.id,
    action: "archive",
    before: row,
  });
  return { status: "archived" };
}
