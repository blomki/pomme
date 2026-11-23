import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amap,
  distribution,
  dutyHistory,
  dutyPlan,
  dutyResponse,
  dutySlot,
  orderPeriod,
  unavailability,
  user,
} from "@/db/schema";
import { effectiveParameters } from "@/domain/amap-settings";
import {
  changedPeople,
  generatePlanning,
  quarterDutyCounts,
  type Assignment,
  type PlanningPerson,
} from "@/domain/duty-planning";
import {
  defaultDutyPlanDays,
  dutyPhase,
  nextQuarterStart,
  quarterRange,
  quarterStartOf,
  type DutyPhase,
  type DutyPlanStatus,
} from "@/domain/duty-plans";
import { effectiveStatus, parisDay, periodDays, periodInstants } from "@/domain/order-periods";

import { requireRole } from "./auth/require-role";
import { dutyPeople, planDays, type DutyPerson } from "./duty-plans";

// Planning des permanences du trimestre (story G2, ADR 0043) : génération, éditeur, envoi aux
// bénévoles et prévenance des changements. Réservé aux admins de l'AMAP.

export type QuarterChoice = "current" | "next";

/** Premier jour du trimestre en cours ou du suivant, à Paris. */
export function quarterOf(choice: QuarterChoice, now: Date): string {
  const today = parisDay(now);
  return choice === "current" ? quarterStartOf(today) : nextQuarterStart(today);
}

/** Un mois est en lecture seule quand il est passé (avant le mois en cours, à Paris). */
const monthIsPast = (month: string, now: Date) => month < parisDay(now).slice(0, 7);

type PlanRow = typeof dutyPlan.$inferSelect;

async function planOf(tx: Transaction, quarterStart: string): Promise<PlanRow | null> {
  const [plan] = await tx.select().from(dutyPlan).where(eq(dutyPlan.quarterStart, quarterStart));
  return plan ?? null;
}

async function quarterDistributions(tx: Transaction, quarterStart: string) {
  const { from, to } = quarterRange(quarterStart);
  return tx
    .select({ id: distribution.id, date: distribution.date })
    .from(distribution)
    .where(
      and(gte(distribution.date, from), lt(distribution.date, to), eq(distribution.isOpen, true)),
    )
    .orderBy(asc(distribution.date));
}

async function amapParameters(tx: Transaction, ctx: AmapContext) {
  const [row] = await tx
    .select({ settings: amap.settings })
    .from(amap)
    .where(eq(amap.id, ctx.amapId!));
  const p = effectiveParameters(row?.settings);
  return { perDistribution: p.volunteersPerDistribution, threshold: p.experiencedThreshold };
}

/**
 * Bénévoles possibles (les amapiens), avec leur expérience : antériorité importée + permanences
 * passées dans Pomme (distributions avant aujourd'hui), et leurs indisponibilités pour ce planning.
 */
async function planningPeople(
  tx: Transaction,
  planId: string | null,
  now: Date,
): Promise<{ people: Array<PlanningPerson & DutyPerson> }> {
  const persons = await dutyPeople(tx);
  const ids = persons.map((p) => p.userId);
  if (ids.length === 0) return { people: [] };
  const [history, done, unavailable] = await Promise.all([
    tx
      .select({ userId: dutyHistory.userId, n: dutyHistory.importedCount })
      .from(dutyHistory)
      .where(inArray(dutyHistory.userId, ids)),
    tx
      .select({ userId: dutySlot.userId })
      .from(dutySlot)
      .innerJoin(distribution, eq(distribution.id, dutySlot.distributionId))
      .where(lt(distribution.date, parisDay(now))),
    planId
      ? tx
          .select({ userId: unavailability.userId, distributionId: unavailability.distributionId })
          .from(unavailability)
          .where(eq(unavailability.dutyPlanId, planId))
      : Promise.resolve([]),
  ]);
  return {
    people: persons.map((p) => ({
      ...p,
      name: `${p.firstName} ${p.lastName}`.trim(),
      experience:
        (history.find((h) => h.userId === p.userId)?.n ?? 0) +
        done.filter((d) => d.userId === p.userId).length,
      unavailable: unavailable.filter((u) => u.userId === p.userId).map((u) => u.distributionId),
    })),
  };
}

export type EditorDistribution = {
  id: string;
  date: string;
  /** Une place par bénévole ; null : place vide. */
  userIds: Array<string | null>;
};

export type PlanningEditorView = {
  quarter: QuarterChoice;
  quarterStart: string;
  perDistribution: number;
  threshold: number;
  people: Array<{ userId: string; name: string; experience: number; unavailable: string[] }>;
  plan: {
    id: string;
    status: DutyPlanStatus;
    sentOn: string | null;
    /** Période de réponse aux indisponibilités (G1). */
    answersPhase: DutyPhase;
    deadlineOn: string;
    /** Personnes à prévenir de changements enregistrés sans prévenir. */
    pending: string[];
    generated: boolean;
  } | null;
  months: Array<{ month: string; readOnly: boolean; distributions: EditorDistribution[] }>;
};

/** Éditeur du planning d'un trimestre (en cours ou prochain). */
export async function getPlanningEditor(
  tx: Transaction,
  ctx: AmapContext,
  quarter: QuarterChoice,
  now = new Date(),
): Promise<PlanningEditorView> {
  await requireRole(tx, ctx, ["admin"]);
  const quarterStart = quarterOf(quarter, now);
  const plan = await planOf(tx, quarterStart);
  const [distributions, { people }, params] = await Promise.all([
    quarterDistributions(tx, quarterStart),
    planningPeople(tx, plan?.id ?? null, now),
    amapParameters(tx, ctx),
  ]);
  const slots = plan
    ? await tx.select().from(dutySlot).where(eq(dutySlot.dutyPlanId, plan.id))
    : [];
  const months: PlanningEditorView["months"] = [];
  for (const d of distributions) {
    const month = d.date.slice(0, 7);
    const userIds: Array<string | null> = Array.from(
      { length: params.perDistribution },
      () => null,
    );
    for (const s of slots.filter((x) => x.distributionId === d.id)) {
      if (s.position - 1 < userIds.length) userIds[s.position - 1] = s.userId;
      else userIds.push(s.userId);
    }
    const group = months.at(-1);
    const row = { id: d.id, date: d.date, userIds };
    if (group?.month === month) group.distributions.push(row);
    else months.push({ month, readOnly: monthIsPast(month, now), distributions: [row] });
  }
  return {
    quarter,
    quarterStart,
    ...params,
    people: people.map(({ userId, name, experience, unavailable }) => ({
      userId,
      name,
      experience,
      unavailable: [...unavailable],
    })),
    plan: plan
      ? {
          id: plan.id,
          status: plan.status,
          sentOn: plan.sentAt ? parisDay(plan.sentAt) : null,
          answersPhase: dutyPhase(
            { opensAt: plan.opensAt, deadlineAt: plan.unavailabilityDeadline },
            now,
          ),
          deadlineOn: planDays(plan).deadlineOn,
          pending: plan.pendingNotice,
          generated: slots.length > 0,
        }
      : null,
    months,
  };
}

/** Planning du trimestre, créé s'il n'existe pas (génération décidée par l'admin). */
async function ensurePlan(tx: Transaction, ctx: AmapContext, quarterStart: string) {
  const existing = await planOf(tx, quarterStart);
  if (existing) return existing;
  const days = defaultDutyPlanDays(quarterStart);
  const instants = periodInstants(days.opensOn, days.deadlineOn);
  const [created] = await tx
    .insert(dutyPlan)
    .values({
      amapId: ctx.amapId!,
      quarterStart,
      opensAt: instants.opensAt,
      unavailabilityDeadline: instants.closesAt,
      createdBy: ctx.userId,
    })
    .returning();
  return created!;
}

const quarterSchema = z.enum(["current", "next"]);

export type GenerateResult =
  { status: "generated"; planId: string; count: number } | { status: "invalid" | "already_sent" };

/**
 * Génère (ou regénère) le planning des mois pas encore passés. Les mois passés restent tels
 * quels et comptent dans la répartition. Refusé une fois le planning envoyé : on l'ajuste
 * alors dans l'éditeur, en prévenant les personnes concernées.
 */
export async function generateQuarterPlanning(
  tx: Transaction,
  ctx: AmapContext,
  input: { quarter: unknown },
  now = new Date(),
): Promise<GenerateResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = quarterSchema.safeParse(input.quarter);
  if (!parsed.success) return { status: "invalid" };
  const plan = await ensurePlan(tx, ctx, quarterOf(parsed.data, now));
  if (plan.status === "sent") return { status: "already_sent" };
  const [distributions, { people }, params, slots] = await Promise.all([
    quarterDistributions(tx, plan.quarterStart),
    planningPeople(tx, plan.id, now),
    amapParameters(tx, ctx),
    tx.select().from(dutySlot).where(eq(dutySlot.dutyPlanId, plan.id)),
  ]);
  const editable = distributions.filter((d) => !monthIsPast(d.date.slice(0, 7), now));
  const editableIds = new Set(editable.map((d) => d.id));
  const initialLoad = new Map<string, number>();
  for (const s of slots.filter((x) => !editableIds.has(x.distributionId))) {
    initialLoad.set(s.userId, (initialLoad.get(s.userId) ?? 0) + 1);
  }
  const assignments = generatePlanning({
    distributions: editable.map((d) => d.id),
    people,
    ...params,
    initialLoad,
  });
  if (editableIds.size > 0) {
    await tx
      .delete(dutySlot)
      .where(
        and(eq(dutySlot.dutyPlanId, plan.id), inArray(dutySlot.distributionId, [...editableIds])),
      );
  }
  if (assignments.length > 0) {
    await tx.insert(dutySlot).values(
      assignments.map((a) => ({
        amapId: ctx.amapId!,
        dutyPlanId: plan.id,
        distributionId: a.distributionId,
        userId: a.userId,
        position: a.position + 1,
      })),
    );
  }
  await tx
    .update(dutyPlan)
    .set({ status: "draft", updatedAt: now })
    .where(eq(dutyPlan.id, plan.id));
  return { status: "generated", planId: plan.id, count: assignments.length };
}

const saveSchema = z.object({
  planId: z.uuid(),
  notify: z.boolean(),
  rows: z
    .array(
      z.object({
        distributionId: z.uuid(),
        userIds: z.array(z.uuid().nullable()).max(20),
      }),
    )
    .max(100),
});

export type SavePlanningResult =
  | {
      status: "saved";
      /** Personnes à prévenir maintenant (planning envoyé, case « Prévenir » cochée). */
      notifyNow: string[];
      /** Personnes ajoutées à la liste « enregistrés sans prévenir ». */
      pending: string[];
    }
  | { status: "invalid" | "past" | "duplicate" };

/**
 * Enregistre les cases de l'éditeur. Avant l'envoi : brouillon, personne n'est prévenu. Après
 * l'envoi : les personnes concernées (ajoutées ou retirées d'une distribution) sont prévenues
 * tout de suite, ou ajoutées à la liste des changements enregistrés sans prévenir.
 */
export async function savePlanning(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<SavePlanningResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { planId, notify, rows } = parsed.data;
  const [plan] = await tx.select().from(dutyPlan).where(eq(dutyPlan.id, planId));
  if (!plan) return { status: "invalid" };
  const distributions = await quarterDistributions(tx, plan.quarterStart);
  const people = new Set((await dutyPeople(tx)).map((p) => p.userId));
  for (const row of rows) {
    const d = distributions.find((x) => x.id === row.distributionId);
    if (!d) return { status: "invalid" };
    if (monthIsPast(d.date.slice(0, 7), now)) return { status: "past" };
    const filled = row.userIds.filter((id): id is string => id !== null);
    if (filled.some((id) => !people.has(id))) return { status: "invalid" };
    // Une même personne deux fois sur une distribution : impossible (contrainte de la base).
    if (new Set(filled).size !== filled.length) return { status: "duplicate" };
  }
  const touched = rows.map((r) => r.distributionId);
  if (touched.length === 0) return { status: "saved", notifyNow: [], pending: [] };
  const before: Assignment[] = (
    await tx
      .select()
      .from(dutySlot)
      .where(and(eq(dutySlot.dutyPlanId, plan.id), inArray(dutySlot.distributionId, touched)))
  ).map((s) => ({ distributionId: s.distributionId, position: s.position - 1, userId: s.userId }));
  const after: Assignment[] = rows.flatMap((r) =>
    r.userIds.flatMap((userId, position) =>
      userId ? [{ distributionId: r.distributionId, position, userId }] : [],
    ),
  );
  await tx
    .delete(dutySlot)
    .where(and(eq(dutySlot.dutyPlanId, plan.id), inArray(dutySlot.distributionId, touched)));
  if (after.length > 0) {
    await tx.insert(dutySlot).values(
      after.map((a) => ({
        amapId: ctx.amapId!,
        dutyPlanId: plan.id,
        distributionId: a.distributionId,
        userId: a.userId,
        position: a.position + 1,
      })),
    );
  }
  if (plan.status !== "sent") {
    await tx
      .update(dutyPlan)
      .set({ status: "draft", updatedAt: now })
      .where(eq(dutyPlan.id, plan.id));
    return { status: "saved", notifyNow: [], pending: [] };
  }
  const changed = changedPeople(before, after);
  if (notify) return { status: "saved", notifyNow: changed, pending: [] };
  const pending = [...new Set([...plan.pendingNotice, ...changed])];
  await tx
    .update(dutyPlan)
    .set({ pendingNotice: pending, updatedAt: now })
    .where(eq(dutyPlan.id, plan.id));
  return { status: "saved", notifyNow: [], pending: changed };
}

export type PlanningRecipient = {
  userId: string;
  email: string;
  firstName: string;
  dates: string[];
};

export type PlanningNotice =
  | {
      status: "ready";
      planId: string;
      quarterStart: string;
      kind: "planning" | "change";
      recipients: PlanningRecipient[];
    }
  | { status: "invalid" | "not_generated" | "not_sent" };

/** Dates de permanence de chacun sur ce planning. */
async function recipientsOf(tx: Transaction, planId: string, userIds: string[] | null) {
  const people = await dutyPeople(tx);
  const slots = await tx
    .select({ userId: dutySlot.userId, date: distribution.date })
    .from(dutySlot)
    .innerJoin(distribution, eq(distribution.id, dutySlot.distributionId))
    .where(eq(dutySlot.dutyPlanId, planId))
    .orderBy(asc(distribution.date));
  const wanted = userIds ?? [...new Set(slots.map((s) => s.userId))];
  return people
    .filter((p) => wanted.includes(p.userId))
    .map((p) => ({
      userId: p.userId,
      email: p.email,
      firstName: p.firstName,
      dates: slots.filter((s) => s.userId === p.userId).map((s) => s.date),
    }));
}

const planIdSchema = z.uuid();

/**
 * « Envoyer le planning aux bénévoles » : le planning passe à « envoyé » ; chaque bénévole
 * reçoit ses dates. Les emails partent ensuite, chacun dans sa transaction.
 */
export async function sendPlanning(
  tx: Transaction,
  ctx: AmapContext,
  input: { planId: unknown },
  now = new Date(),
): Promise<PlanningNotice> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = planIdSchema.safeParse(input.planId);
  if (!parsed.success) return { status: "invalid" };
  const [plan] = await tx.select().from(dutyPlan).where(eq(dutyPlan.id, parsed.data));
  if (!plan) return { status: "invalid" };
  const recipients = await recipientsOf(tx, plan.id, null);
  if (recipients.length === 0) return { status: "not_generated" };
  await tx
    .update(dutyPlan)
    .set({ status: "sent", sentAt: now, pendingNotice: [], updatedAt: now })
    .where(eq(dutyPlan.id, plan.id));
  return {
    status: "ready",
    planId: plan.id,
    quarterStart: plan.quarterStart,
    kind: "planning",
    recipients,
  };
}

/**
 * Prévenir des personnes de leurs nouvelles dates : après « Enregistrer » avec la case cochée
 * (`userIds`), ou « Prévenir maintenant » (les personnes en attente, liste vidée).
 */
export async function planChangeNotice(
  tx: Transaction,
  ctx: AmapContext,
  input: { planId: unknown; userIds?: string[] },
  now = new Date(),
): Promise<PlanningNotice> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = planIdSchema.safeParse(input.planId);
  if (!parsed.success) return { status: "invalid" };
  const [plan] = await tx.select().from(dutyPlan).where(eq(dutyPlan.id, parsed.data));
  if (!plan) return { status: "invalid" };
  if (plan.status !== "sent") return { status: "not_sent" };
  const userIds = input.userIds ?? plan.pendingNotice;
  if (!input.userIds) {
    await tx
      .update(dutyPlan)
      .set({ pendingNotice: [], updatedAt: now })
      .where(eq(dutyPlan.id, plan.id));
  }
  return {
    status: "ready",
    planId: plan.id,
    quarterStart: plan.quarterStart,
    kind: "change",
    recipients: await recipientsOf(tx, plan.id, userIds),
  };
}

export type PlanningBanner = {
  quarterStart: string;
  answered: number;
  total: number;
  planStatus: "none" | DutyPlanStatus;
  /** Personnes à prévenir, tous trimestres confondus (en cours et prochain). */
  pending: Array<{ planId: string; names: string[] }>;
};

/** Bandeau « Prochain trimestre » de « Planning des permanences » (écran A3). */
export async function getPlanningBanner(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<PlanningBanner> {
  await requireRole(tx, ctx, ["admin"]);
  const next = quarterOf("next", now);
  const plans = await tx
    .select()
    .from(dutyPlan)
    .where(inArray(dutyPlan.quarterStart, [quarterOf("current", now), next]));
  const people = await dutyPeople(tx);
  const nextPlan = plans.find((p) => p.quarterStart === next);
  const answers = nextPlan
    ? await tx
        .select({ userId: dutyResponse.userId, answeredAt: dutyResponse.answeredAt })
        .from(dutyResponse)
        .where(eq(dutyResponse.dutyPlanId, nextPlan.id))
    : [];
  const ids = new Set(people.map((p) => p.userId));
  const nameOf = (id: string) => {
    const p = people.find((x) => x.userId === id);
    return p ? `${p.firstName} ${p.lastName}`.trim() : "";
  };
  return {
    quarterStart: next,
    answered: answers.filter((a) => a.answeredAt && ids.has(a.userId)).length,
    total: people.length,
    planStatus: nextPlan?.status ?? "none",
    pending: plans
      .filter((p) => p.pendingNotice.length > 0)
      .map((p) => ({ planId: p.id, names: p.pendingNotice.map(nameOf).filter(Boolean) })),
  };
}

export type MonthDuties = {
  /** Période de commande du mois (commandes de ce mois), ou null si elle n'existe pas. */
  orderPeriod: {
    opensOn: string;
    closesOn: string;
    status: "scheduled" | "open" | "closed";
  } | null;
  /** Bénévoles prévus par distribution, avec leur nombre de permanences sur le trimestre. */
  volunteers: Record<string, Array<{ name: string; quarterCount: number }>>;
};

/**
 * Calendrier du mois en lecture seule (story G3) : période de commande et bénévoles prévus à
 * chaque distribution, avec leur nombre de permanences du trimestre.
 */
export async function getMonthDuties(
  tx: Transaction,
  ctx: AmapContext,
  month: string,
  now = new Date(),
): Promise<MonthDuties> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = /^\d{4}-\d{2}$/.test(month) ? month : null;
  if (!parsed) return { orderPeriod: null, volunteers: {} };
  const range = quarterRange(quarterStartOf(`${parsed}-01`));
  const [slots, people, [period]] = await Promise.all([
    tx
      .select({
        userId: dutySlot.userId,
        distributionId: dutySlot.distributionId,
        position: dutySlot.position,
        date: distribution.date,
      })
      .from(dutySlot)
      .innerJoin(distribution, eq(distribution.id, dutySlot.distributionId))
      .where(and(gte(distribution.date, range.from), lt(distribution.date, range.to)))
      .orderBy(asc(distribution.date), asc(dutySlot.position)),
    tx.select({ id: user.id, firstName: user.firstName, lastName: user.lastName }).from(user),
    tx
      .select()
      .from(orderPeriod)
      .where(eq(orderPeriod.month, `${parsed}-01`)),
  ]);
  const counts = quarterDutyCounts(slots, range);
  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.lastName}`.trim() : "";
  };
  const volunteers: MonthDuties["volunteers"] = {};
  for (const s of slots.filter((x) => x.date.startsWith(parsed))) {
    (volunteers[s.distributionId] ??= []).push({
      name: nameOf(s.userId),
      quarterCount: counts.get(s.userId) ?? 0,
    });
  }
  return {
    orderPeriod: period
      ? {
          ...periodDays(period),
          status: effectiveStatus(period, now),
        }
      : null,
    volunteers,
  };
}
