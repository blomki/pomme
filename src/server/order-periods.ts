import { and, asc, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import type { Database, Transaction } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amap,
  catalog,
  cheque,
  credit,
  household,
  householdMember,
  order,
  orderLine,
  orderPeriod,
  user,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { addMonths, parseMonth } from "@/domain/distributions";
import {
  checkPeriodDays,
  chequeKey,
  chequesAtClosing,
  defaultPeriodDays,
  dueTransition,
  effectiveStatus,
  parisDay,
  periodDays,
  periodInstants,
  type DatesError,
  type OrderPeriodStatus,
} from "@/domain/order-periods";

import { requireRole } from "./auth/require-role";
import { writeAuditLog } from "./audit";

// Période de commande (story D2, ADR 0015) : dates fixées par l'admin, ouverture et clôture
// automatiques (tâche planifiée, une fois par heure) ou clôture manuelle, réouverture, relance
// des foyers sans commande. La clôture calcule les chèques attendus, avoirs déduits.

type PeriodRow = typeof orderPeriod.$inferSelect;

export type OrderPeriodView = {
  /** Mois commandé (« 2026-12 »). */
  month: string;
  /** null tant que les dates de ce mois n'ont jamais été fixées. */
  id: string | null;
  /** État réel à cet instant ("none" : pas encore de période pour ce mois). */
  status: OrderPeriodStatus | "none";
  /** Jours d'ouverture et de clôture (proposés par défaut s'il n'y a pas encore de période). */
  opensOn: string;
  closesOn: string;
  /** Jour de la clôture effective (clôture manuelle avant la date prévue, par exemple). */
  closedOn: string | null;
  reopened: boolean;
  /** « N foyers sur M ont commandé ». */
  orderedHouseholds: number;
  activeHouseholds: number;
};

/** Mois en cours à Paris (« 2026-11 »). */
const currentMonth = (now: Date) => parisDay(now).slice(0, 7);

/** Foyers actifs de l'AMAP : ni archivés ni anonymisés. */
async function activeHouseholdIds(tx: Transaction): Promise<string[]> {
  const rows = await tx
    .select({ id: household.id })
    .from(household)
    .where(and(isNull(household.archivedAt), isNull(household.anonymizedAt)));
  return rows.map((r) => r.id);
}

/** Foyers qui ont commandé au moins un produit ce mois-ci (quantité > 0). */
async function orderingHouseholdIds(tx: Transaction, month: string): Promise<Set<string>> {
  const rows = await tx
    .selectDistinct({ id: order.householdId })
    .from(orderLine)
    .innerJoin(order, eq(order.id, orderLine.orderId))
    .innerJoin(catalog, eq(catalog.id, order.catalogId))
    .where(and(eq(catalog.month, `${month}-01`), gt(orderLine.quantity, 0)));
  return new Set(rows.map((r) => r.id));
}

function toView(
  month: string,
  period: PeriodRow | undefined,
  now: Date,
  counts: { ordered: number; active: number },
): OrderPeriodView {
  const base = { month, orderedHouseholds: counts.ordered, activeHouseholds: counts.active };
  if (!period) {
    return {
      ...base,
      id: null,
      status: "none",
      ...defaultPeriodDays(month),
      closedOn: null,
      reopened: false,
    };
  }
  const status = effectiveStatus(period, now);
  const closedOn =
    status === "closed"
      ? parisDay(
          period.closedAt && period.closedAt < period.closesAt
            ? period.closedAt
            : new Date(period.closesAt.getTime() - 1),
        )
      : null;
  return {
    ...base,
    id: period.id,
    status,
    ...periodDays(period),
    closedOn,
    reopened: period.reopenedAt !== null,
  };
}

/**
 * Période affichée dans le bandeau du tableau de bord : une période ouverte s'il y en a une
 * (une réouverture, par exemple), sinon celle du mois prochain (les commandes de décembre se
 * passent en novembre), même si ses dates ne sont pas encore fixées.
 */
export async function getDashboardOrderPeriod(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<OrderPeriodView> {
  await requireRole(tx, ctx, ["admin"]);
  const periods = await tx
    .select()
    .from(orderPeriod)
    .where(ne(orderPeriod.status, "closed"))
    .orderBy(asc(orderPeriod.month));
  const open = periods.find((p) => effectiveStatus(p, now) === "open");
  const month = open ? open.month.slice(0, 7) : addMonths(currentMonth(now), 1);
  const [period] = open
    ? [open]
    : await tx
        .select()
        .from(orderPeriod)
        .where(eq(orderPeriod.month, `${month}-01`));
  const active = await activeHouseholdIds(tx);
  const ordering = await orderingHouseholdIds(tx, month);
  const ordered = active.filter((id) => ordering.has(id)).length;
  return toView(month, period, now, { ordered, active: active.length });
}

// --- Dates -------------------------------------------------------------------------------------

const datesSchema = z.object({
  month: z.string(),
  opensOn: z.string().default(""),
  closesOn: z.string(),
});

export type SaveDatesResult =
  | { status: "saved"; period: OrderPeriodStatus }
  | { status: "invalid"; errors: DatesError[] }
  | { status: "closed" };

/**
 * Fixe ou modifie les jours d'ouverture et de clôture d'un mois.
 *
 * - Pas encore de période : elle est créée (prévue, ou ouverte tout de suite si le jour
 *   d'ouverture est aujourd'hui ou passé).
 * - Période prévue : les deux jours changent.
 * - Période ouverte : seul le jour de clôture change (l'ouverture a eu lieu).
 * - Période clôturée : refusé, il faut « Rouvrir les commandes ».
 */
export async function saveOrderPeriodDates(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<SaveDatesResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = datesSchema.safeParse(input);
  const month = parsed.success ? parseMonth(parsed.data.month) : null;
  if (!parsed.success || !month) return { status: "invalid", errors: ["closesOn"] };

  const [existing] = await tx
    .select()
    .from(orderPeriod)
    .where(eq(orderPeriod.month, `${month}-01`))
    .for("update");
  const current = existing ? effectiveStatus(existing, now) : null;
  if (current === "closed") return { status: "closed" };

  // Période ouverte : le jour d'ouverture enregistré est gardé, quoi qu'envoie le formulaire.
  const opensOn =
    existing && current === "open" ? periodDays(existing).opensOn : parsed.data.opensOn;
  const checked = checkPeriodDays({ opensOn, closesOn: parsed.data.closesOn }, parisDay(now));
  if ("errors" in checked) return { status: "invalid", errors: checked.errors };

  const instants = periodInstants(checked.opensOn, checked.closesOn);
  const before = existing ? periodDays(existing) : null;
  const periodId = existing?.id ?? uuidv7();
  if (existing) {
    await tx.update(orderPeriod).set(instants).where(eq(orderPeriod.id, existing.id));
  } else {
    await tx.insert(orderPeriod).values({
      id: periodId,
      amapId: ctx.amapId!,
      month: `${month}-01`,
      ...instants,
      createdBy: ctx.userId,
    });
  }
  await writeAuditLog(tx, ctx, {
    entityType: "order_period",
    entityId: periodId,
    action: existing ? "update_dates" : "create",
    before,
    after: { month, opensOn: checked.opensOn, closesOn: checked.closesOn },
  });
  const status = effectiveStatus({ status: existing?.status ?? "scheduled", ...instants }, now);
  return { status: "saved", period: status };
}

// --- Clôture -----------------------------------------------------------------------------------

export type ClosingSummary = { cheques: number; totalCents: number };

/**
 * Clôture une période, dans la transaction de l'appelant (une seule transaction : tout ou
 * rien). Calcule un chèque attendu par foyer et par producteur commandé, avoirs en attente
 * déduits (domain/order-periods.ts, chequesAtClosing).
 *
 * Après une réouverture : les chèques encore « attendus » sont recalculés (leurs avoirs
 * détachés puis déduits de nouveau) ; un chèque déjà pointé reste tel quel, avec ses avoirs ;
 * un chèque attendu qui n'a plus de commande est archivé.
 *
 * La ligne de la période est verrouillée (FOR UPDATE) : deux clôtures simultanées (tâche
 * planifiée et admin, ou deux instances pendant un déploiement) ne s'exécutent pas deux fois.
 *
 * @returns null si la période était déjà clôturée
 */
export async function closePeriod(
  tx: Transaction,
  ctx: AmapContext,
  periodId: string,
  now: Date,
): Promise<ClosingSummary | null> {
  const [period] = await tx
    .select()
    .from(orderPeriod)
    .where(eq(orderPeriod.id, periodId))
    .for("update");
  if (!period || period.status === "closed") return null;

  const lines = await tx
    .select({
      householdId: order.householdId,
      producerId: catalog.producerId,
      quantity: orderLine.quantity,
      unitPriceCents: orderLine.unitPriceCents,
    })
    .from(orderLine)
    .innerJoin(order, eq(order.id, orderLine.orderId))
    .innerJoin(catalog, eq(catalog.id, order.catalogId))
    .where(eq(catalog.month, period.month));

  const existing = await tx.select().from(cheque).where(eq(cheque.orderPeriodId, period.id));
  const locked = new Set(
    existing
      .filter((c) => c.status !== "expected")
      .map((c) => chequeKey(c.householdId, c.producerId)),
  );
  const recomputed = existing.filter((c) => c.status === "expected");

  // Réouverture : les avoirs déduits des chèques encore attendus redeviennent en attente.
  if (recomputed.length > 0) {
    await tx
      .update(credit)
      .set({ status: "created", deductedOnChequeId: null })
      .where(
        inArray(
          credit.deductedOnChequeId,
          recomputed.map((c) => c.id),
        ),
      );
  }
  const pending = await tx
    .select({
      id: credit.id,
      householdId: credit.householdId,
      producerId: credit.producerId,
      amountCents: credit.amountCents,
    })
    .from(credit)
    .where(and(eq(credit.status, "created"), isNull(credit.archivedAt)));

  const toIssue = chequesAtClosing(lines, pending, locked);
  const issuedKeys = new Set(toIssue.map((c) => chequeKey(c.householdId, c.producerId)));

  for (const issued of toIssue) {
    const amounts = {
      grossCents: issued.grossCents,
      creditsCents: issued.creditsCents,
      expectedCents: issued.expectedCents,
    };
    const previous = recomputed.find(
      (c) => c.householdId === issued.householdId && c.producerId === issued.producerId,
    );
    const chequeId = previous?.id ?? uuidv7();
    if (previous) {
      await tx
        .update(cheque)
        .set({ ...amounts, archivedAt: null })
        .where(eq(cheque.id, previous.id));
    } else {
      await tx.insert(cheque).values({
        id: chequeId,
        amapId: ctx.amapId!,
        householdId: issued.householdId,
        producerId: issued.producerId,
        orderPeriodId: period.id,
        ...amounts,
      });
    }
    for (const part of issued.credits) {
      await tx
        .update(credit)
        .set({ status: "deducted", deductedOnChequeId: chequeId, amountCents: part.deductedCents })
        .where(eq(credit.id, part.id));
      if (part.remainderCents > 0) {
        await tx.insert(credit).values({
          amapId: ctx.amapId!,
          householdId: issued.householdId,
          producerId: issued.producerId,
          amountCents: part.remainderCents,
          splitFromCreditId: part.id,
          createdBy: ctx.userId,
        });
      }
    }
  }

  // Chèques attendus qui n'ont plus de commande après une réouverture : archivés.
  for (const stale of recomputed) {
    if (!issuedKeys.has(chequeKey(stale.householdId, stale.producerId)) && !stale.archivedAt) {
      await tx.update(cheque).set({ archivedAt: now }).where(eq(cheque.id, stale.id));
    }
  }

  await tx
    .update(orderPeriod)
    .set({ status: "closed", closedAt: now })
    .where(eq(orderPeriod.id, period.id));

  const summary = {
    cheques: toIssue.length,
    totalCents: toIssue.reduce((sum, c) => sum + c.expectedCents, 0),
  };
  await writeAuditLog(tx, ctx, {
    entityType: "order_period",
    entityId: period.id,
    action: "close",
    after: { month: period.month.slice(0, 7), automatic: ctx.userId === null, ...summary },
  });
  return summary;
}

export type CloseResult = { status: "closed"; cheques: number } | { status: "not_open" };

/** « Clôturer maintenant » : clôture manuelle d'une période ouverte, par un admin. */
export async function closeOrderPeriod(
  tx: Transaction,
  ctx: AmapContext,
  input: { periodId: string },
  now = new Date(),
): Promise<CloseResult> {
  await requireRole(tx, ctx, ["admin"]);
  const periodId = z.uuid().safeParse(input.periodId);
  if (!periodId.success) return { status: "not_open" };
  const [period] = await tx.select().from(orderPeriod).where(eq(orderPeriod.id, periodId.data));
  if (!period || effectiveStatus(period, now) !== "open") return { status: "not_open" };
  const summary = await closePeriod(tx, ctx, period.id, now);
  return summary ? { status: "closed", cheques: summary.cheques } : { status: "not_open" };
}

// --- Réouverture -------------------------------------------------------------------------------

export type ReopenResult =
  { status: "reopened" } | { status: "invalid"; errors: DatesError[] } | { status: "not_closed" };

/**
 * « Rouvrir les commandes » jusqu'à un nouveau jour de clôture (il faut une date : l'ancienne
 * est passée). Les chèques restent jusqu'à la clôture suivante, qui recalcule ceux qui ne sont
 * pas encore pointés. Les commandes dont le chèque est pointé et les lignes des distributions
 * passées restent verrouillées (contrôlé à la saisie des commandes, D3).
 */
export async function reopenOrderPeriod(
  tx: Transaction,
  ctx: AmapContext,
  input: { periodId: string; closesOn: string },
  now = new Date(),
): Promise<ReopenResult> {
  await requireRole(tx, ctx, ["admin"]);
  const periodId = z.uuid().safeParse(input.periodId);
  if (!periodId.success) return { status: "not_closed" };
  const [period] = await tx
    .select()
    .from(orderPeriod)
    .where(eq(orderPeriod.id, periodId.data))
    .for("update");
  if (!period || effectiveStatus(period, now) !== "closed") return { status: "not_closed" };
  if (period.status !== "closed") {
    // Date de clôture passée, mais la tâche planifiée n'est pas encore passée : on clôture
    // d'abord, pour que les chèques existent avant de rouvrir.
    await closePeriod(tx, ctx, period.id, now);
  }

  const { opensOn } = periodDays(period);
  const checked = checkPeriodDays({ opensOn, closesOn: input.closesOn }, parisDay(now));
  if ("errors" in checked) return { status: "invalid", errors: checked.errors };
  const { closesAt } = periodInstants(checked.opensOn, checked.closesOn);
  await tx
    .update(orderPeriod)
    .set({ status: "open", closesAt, reopenedAt: now })
    .where(eq(orderPeriod.id, period.id));
  await writeAuditLog(tx, ctx, {
    entityType: "order_period",
    entityId: period.id,
    action: "reopen",
    after: { month: period.month.slice(0, 7), closesOn: checked.closesOn },
  });
  return { status: "reopened" };
}

// --- Relance -----------------------------------------------------------------------------------

export type ReminderRecipient = {
  userId: string;
  email: string;
  firstName: string;
};

export type ReminderPlan =
  | {
      status: "ready";
      periodId: string;
      month: string;
      closesOn: string;
      recipients: ReminderRecipient[];
    }
  | { status: "not_open" };

/**
 * Personnes à relancer : les membres des foyers actifs qui n'ont rien commandé pour la
 * période ouverte. L'envoi (une seule relance par personne et par période) est fait ensuite,
 * hors de cette transaction (order-periods-actions.ts).
 */
export async function planReminders(
  tx: Transaction,
  ctx: AmapContext,
  input: { periodId: string },
  now = new Date(),
): Promise<ReminderPlan> {
  await requireRole(tx, ctx, ["admin"]);
  const periodId = z.uuid().safeParse(input.periodId);
  if (!periodId.success) return { status: "not_open" };
  const [period] = await tx.select().from(orderPeriod).where(eq(orderPeriod.id, periodId.data));
  if (!period || effectiveStatus(period, now) !== "open") return { status: "not_open" };

  const month = period.month.slice(0, 7);
  const ordering = await orderingHouseholdIds(tx, month);
  const members = await tx
    .select({
      householdId: householdMember.householdId,
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
    })
    .from(householdMember)
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .innerJoin(user, eq(user.id, householdMember.userId))
    .where(
      and(
        isNull(householdMember.archivedAt),
        isNull(household.archivedAt),
        isNull(household.anonymizedAt),
      ),
    )
    .orderBy(asc(household.name), desc(householdMember.isPrimary));

  return {
    status: "ready",
    periodId: period.id,
    month,
    closesOn: periodDays(period).closesOn,
    recipients: members
      .filter((m) => !ordering.has(m.householdId))
      .map(({ userId, email, firstName }) => ({ userId, email, firstName })),
  };
}

// --- Tâche planifiée ---------------------------------------------------------------------------

export type TransitionReport = { amapId: string; month: string; action: "open" | "close" };

/**
 * Passages automatiques de toutes les AMAP (tâche planifiée, une fois par heure) : ouvre les
 * périodes dont le jour d'ouverture est arrivé, clôture celles dont le jour de clôture est
 * passé. Chaque AMAP dans sa propre transaction, sans utilisateur connecté : le journal note
 * alors une action automatique (acteur vide).
 */
export async function runOrderPeriodTransitions(
  db: Database,
  now = new Date(),
): Promise<TransitionReport[]> {
  // La liste des AMAP est publique (politique amap_select) : pas besoin de contexte ici.
  const amaps = await db.select({ id: amap.id }).from(amap).orderBy(asc(amap.id));
  const report: TransitionReport[] = [];
  for (const { id: amapId } of amaps) {
    // Accès de confiance « closing_job » : sans compte connecté, la Row Level Security ne
    // montrerait aucune commande (S12, ADR 0021).
    const ctx: AmapContext = { amapId, userId: null, trusted: "closing_job" };
    await withAmapContext(db, ctx, async (tx) => {
      const periods = await tx
        .select()
        .from(orderPeriod)
        .where(ne(orderPeriod.status, "closed"))
        .orderBy(asc(orderPeriod.month));
      for (const period of periods) {
        const action = dueTransition(period, now);
        if (!action) continue;
        const month = period.month.slice(0, 7);
        if (action === "close") {
          if (await closePeriod(tx, ctx, period.id, now)) report.push({ amapId, month, action });
          continue;
        }
        const opened = await tx
          .update(orderPeriod)
          .set({ status: "open" })
          .where(and(eq(orderPeriod.id, period.id), eq(orderPeriod.status, "scheduled")))
          .returning({ id: orderPeriod.id });
        if (opened.length > 0) {
          await writeAuditLog(tx, ctx, {
            entityType: "order_period",
            entityId: period.id,
            action: "open",
            after: { month, automatic: true },
          });
          report.push({ amapId, month, action });
        }
      }
    });
  }
  return report;
}
