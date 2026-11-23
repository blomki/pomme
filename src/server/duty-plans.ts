import { and, asc, eq, gt, gte, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  distribution,
  dutyPlan,
  dutyResponse,
  household,
  householdMember,
  unavailability,
  user,
} from "@/db/schema";
import {
  checkDutyPlanDays,
  defaultDutyPlanDays,
  dutyPhase,
  isQuarterStart,
  keepQuarterDistributions,
  nextQuarterStart,
  quarterRange,
  type DutyPhase,
  type DutyPlanDaysError,
} from "@/domain/duty-plans";
import { parisDay, periodDays, periodInstants } from "@/domain/order-periods";

import { requireRole } from "./auth/require-role";
import { myHousehold } from "./orders";

// Indisponibilités du trimestre (story G1, ADR 0042) : la période de réponse que règle l'admin,
// l'écran « Mes disponibilités » de chaque amapien, et le suivi des réponses (écran A8).

type PlanRow = typeof dutyPlan.$inferSelect;

/** Jours d'ouverture et de date limite d'un planning, tels que l'admin les a choisis. */
export function planDays(plan: Pick<PlanRow, "opensAt" | "unavailabilityDeadline">) {
  const { opensOn, closesOn } = periodDays({
    opensAt: plan.opensAt,
    closesAt: plan.unavailabilityDeadline,
  });
  return { opensOn, deadlineOn: closesOn };
}

const phaseOf = (plan: PlanRow, now: Date): DutyPhase =>
  dutyPhase({ opensAt: plan.opensAt, deadlineAt: plan.unavailabilityDeadline }, now);

/** Planning du prochain trimestre pas encore commencé (le plus proche), ou null. */
async function upcomingPlan(tx: Transaction, now: Date): Promise<PlanRow | null> {
  const [plan] = await tx
    .select()
    .from(dutyPlan)
    .where(gt(dutyPlan.quarterStart, parisDay(now)))
    .orderBy(asc(dutyPlan.quarterStart))
    .limit(1);
  return plan ?? null;
}

/** Distributions ouvertes du trimestre, dans l'ordre des dates. */
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

// --- Amapien : « Mes disponibilités » (écran 7) -----------------------------------------------

export type MyAvailability =
  | { status: "no_household" }
  | { status: "none" }
  | {
      status: "ready";
      planId: string;
      quarterStart: string;
      deadlineOn: string;
      phase: Exclude<DutyPhase, "upcoming">;
      distributions: Array<{ id: string; date: string }>;
      /** Distributions cochées « indisponible ». */
      unavailable: string[];
      /** Date de la réponse (« 2026-11-24 »), ou null : pas encore répondu. */
      answeredOn: string | null;
    };

/**
 * Ce que l'amapien connecté voit : le planning du prochain trimestre dont la période de réponse
 * a commencé, ses dates cochées et sa réponse. Après la date limite : lecture seule.
 */
export async function getMyAvailability(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<MyAvailability> {
  if (!(await myHousehold(tx, ctx))) return { status: "no_household" };
  const plan = await upcomingPlan(tx, now);
  const phase = plan ? phaseOf(plan, now) : "upcoming";
  if (!plan || phase === "upcoming") return { status: "none" };
  const userId = ctx.userId!;
  const [distributions, picked, [response]] = await Promise.all([
    quarterDistributions(tx, plan.quarterStart),
    tx
      .select({ distributionId: unavailability.distributionId })
      .from(unavailability)
      .where(and(eq(unavailability.dutyPlanId, plan.id), eq(unavailability.userId, userId))),
    tx
      .select({ answeredAt: dutyResponse.answeredAt })
      .from(dutyResponse)
      .where(and(eq(dutyResponse.dutyPlanId, plan.id), eq(dutyResponse.userId, userId))),
  ]);
  return {
    status: "ready",
    planId: plan.id,
    quarterStart: plan.quarterStart,
    deadlineOn: planDays(plan).deadlineOn,
    phase,
    distributions,
    unavailable: picked.map((p) => p.distributionId),
    answeredOn: response?.answeredAt ? parisDay(response.answeredAt) : null,
  };
}

const saveMineSchema = z.object({
  planId: z.uuid(),
  distributionIds: z.array(z.uuid()).max(200),
});

export type SaveAvailabilityResult =
  { status: "saved"; count: number } | { status: "invalid" | "closed" | "no_household" };

/**
 * Envoi de « Mes disponibilités » : remplace les dates cochées de la personne connectée et
 * note sa réponse (rien coché = toujours disponible). Refusé hors de la période de réponse.
 */
export async function saveMyAvailability(
  tx: Transaction,
  ctx: AmapContext,
  input: { planId: unknown; distributionIds: unknown },
  now = new Date(),
): Promise<SaveAvailabilityResult> {
  if (!(await myHousehold(tx, ctx))) return { status: "no_household" };
  const parsed = saveMineSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const [plan] = await tx.select().from(dutyPlan).where(eq(dutyPlan.id, parsed.data.planId));
  if (!plan) return { status: "invalid" };
  // Jusqu'à la date limite, même si l'admin a déjà généré un brouillon (G2) ; plus après l'envoi.
  if (phaseOf(plan, now) !== "open" || plan.status === "sent") return { status: "closed" };
  const quarter = (await quarterDistributions(tx, plan.quarterStart)).map((d) => d.id);
  const kept = keepQuarterDistributions(parsed.data.distributionIds, quarter);
  if (!kept) return { status: "invalid" };

  const userId = ctx.userId!;
  const amapId = ctx.amapId!;
  await tx
    .delete(unavailability)
    .where(and(eq(unavailability.dutyPlanId, plan.id), eq(unavailability.userId, userId)));
  if (kept.length > 0) {
    await tx
      .insert(unavailability)
      .values(
        kept.map((distributionId) => ({ amapId, dutyPlanId: plan.id, userId, distributionId })),
      );
  }
  await tx
    .insert(dutyResponse)
    .values({ amapId, dutyPlanId: plan.id, userId, answeredAt: now })
    .onConflictDoUpdate({
      target: [dutyResponse.dutyPlanId, dutyResponse.userId],
      set: { answeredAt: now, updatedAt: now },
    });
  return { status: "saved", count: kept.length };
}

// --- Administrateur : « Disponibilités du trimestre » (écran A8) ------------------------------

export type DutyPerson = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  householdName: string;
};

/** Amapiens de l'AMAP courante : les membres des foyers actifs, chacun une fois. */
export async function dutyPeople(tx: Transaction): Promise<DutyPerson[]> {
  const rows = await tx
    .select({
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      householdName: household.name,
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
    .orderBy(asc(user.firstName), asc(user.lastName));
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.userId) && seen.add(r.userId));
}

export type DutyAnswerRow = DutyPerson & {
  answeredOn: string | null;
  lastRemindedOn: string | null;
  /** Dates d'indisponibilité, dans l'ordre. */
  dates: string[];
};

export type DutyAdminView = {
  quarterStart: string;
  /** Planning enregistré ; absent : jours proposés, rien n'est encore ouvert. */
  plan: {
    id: string;
    phase: DutyPhase;
    openingNoticeOn: string | null;
    lastReminderOn: string | null;
  } | null;
  opensOn: string;
  deadlineOn: string;
  autoReminder: boolean;
  distributionCount: number;
  rows: DutyAnswerRow[];
};

/** Écran A8 : le planning du prochain trimestre, ou des jours proposés s'il n'existe pas. */
export async function getDutyAdmin(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<DutyAdminView> {
  await requireRole(tx, ctx, ["admin"]);
  const plan = await upcomingPlan(tx, now);
  const quarterStart = plan?.quarterStart ?? nextQuarterStart(parisDay(now));
  const [distributions, people] = await Promise.all([
    quarterDistributions(tx, quarterStart),
    dutyPeople(tx),
  ]);
  if (!plan) {
    return {
      quarterStart,
      plan: null,
      ...defaultDutyPlanDays(quarterStart),
      autoReminder: true,
      distributionCount: distributions.length,
      rows: people.map((p) => ({ ...p, answeredOn: null, lastRemindedOn: null, dates: [] })),
    };
  }
  const [responses, picked] = await Promise.all([
    tx.select().from(dutyResponse).where(eq(dutyResponse.dutyPlanId, plan.id)),
    tx
      .select({ userId: unavailability.userId, date: distribution.date })
      .from(unavailability)
      .innerJoin(distribution, eq(distribution.id, unavailability.distributionId))
      .where(eq(unavailability.dutyPlanId, plan.id))
      .orderBy(asc(distribution.date)),
  ]);
  const day = (instant: Date | null) => (instant ? parisDay(instant) : null);
  return {
    quarterStart,
    plan: {
      id: plan.id,
      phase: phaseOf(plan, now),
      openingNoticeOn: day(plan.openingNoticeAt),
      lastReminderOn: day(plan.lastReminderAt),
    },
    ...planDays(plan),
    autoReminder: plan.autoReminder,
    distributionCount: distributions.length,
    rows: people.map((p) => {
      const response = responses.find((r) => r.userId === p.userId);
      return {
        ...p,
        answeredOn: day(response?.answeredAt ?? null),
        lastRemindedOn: day(response?.lastRemindedAt ?? null),
        dates: picked.filter((u) => u.userId === p.userId).map((u) => u.date),
      };
    }),
  };
}

const savePlanSchema = z.object({
  quarterStart: z.string(),
  opensOn: z.string(),
  deadlineOn: z.string(),
  autoReminder: z.boolean(),
});

export type SaveDutyPlanResult =
  { status: "saved"; planId: string } | { status: "invalid" } | { status: DutyPlanDaysError };

/** Enregistre la période de réponse du trimestre (création, ou changement des jours). */
export async function saveDutyPlan(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveDutyPlanResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = savePlanSchema.safeParse(input);
  if (!parsed.success || !isQuarterStart(parsed.data.quarterStart)) return { status: "invalid" };
  const { quarterStart, opensOn, deadlineOn, autoReminder } = parsed.data;
  const error = checkDutyPlanDays({ quarterStart, opensOn, deadlineOn });
  if (error) return { status: error };
  const { opensAt, closesAt } = periodInstants(opensOn, deadlineOn);
  const now = new Date();
  const [saved] = await tx
    .insert(dutyPlan)
    .values({
      amapId: ctx.amapId!,
      quarterStart,
      opensAt,
      unavailabilityDeadline: closesAt,
      autoReminder,
      createdBy: ctx.userId,
    })
    .onConflictDoUpdate({
      target: [dutyPlan.amapId, dutyPlan.quarterStart],
      set: { opensAt, unavailabilityDeadline: closesAt, autoReminder, updatedAt: now },
    })
    .returning({ id: dutyPlan.id });
  return { status: "saved", planId: saved!.id };
}

export type DutyReminderPlan =
  | {
      status: "ready";
      planId: string;
      quarterStart: string;
      deadlineOn: string;
      distributionCount: number;
      recipients: DutyPerson[];
    }
  | { status: "not_open" | "invalid" };

const remindSchema = z.object({ planId: z.uuid(), userId: z.uuid().optional() });

/**
 * Relance manuelle (écran A8) : les amapiens sans réponse, ou une seule personne. Les emails
 * partent ensuite, chacun dans sa transaction (duty-notices.ts).
 */
export async function planDutyReminders(
  tx: Transaction,
  ctx: AmapContext,
  input: { planId: unknown; userId?: unknown },
  now = new Date(),
): Promise<DutyReminderPlan> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = remindSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const [plan] = await tx.select().from(dutyPlan).where(eq(dutyPlan.id, parsed.data.planId));
  if (!plan) return { status: "invalid" };
  if (phaseOf(plan, now) !== "open") return { status: "not_open" };
  const recipients = (await withoutAnswer(tx, plan.id)).filter(
    (p) => !parsed.data.userId || p.userId === parsed.data.userId,
  );
  return {
    status: "ready",
    planId: plan.id,
    quarterStart: plan.quarterStart,
    deadlineOn: planDays(plan).deadlineOn,
    distributionCount: (await quarterDistributions(tx, plan.quarterStart)).length,
    recipients,
  };
}

/** Amapiens qui n'ont pas encore répondu pour ce planning. */
export async function withoutAnswer(tx: Transaction, planId: string): Promise<DutyPerson[]> {
  const [people, responses] = await Promise.all([
    dutyPeople(tx),
    tx
      .select({ userId: dutyResponse.userId, answeredAt: dutyResponse.answeredAt })
      .from(dutyResponse)
      .where(eq(dutyResponse.dutyPlanId, planId)),
  ]);
  const done = new Set(responses.filter((r) => r.answeredAt).map((r) => r.userId));
  return people.filter((p) => !done.has(p.userId));
}

/** Note la relance d'une personne (date affichée dans le tableau de l'admin). */
export async function markReminded(
  tx: Transaction,
  amapId: string,
  planId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await tx
    .insert(dutyResponse)
    .values({ amapId, dutyPlanId: planId, userId, lastRemindedAt: now })
    .onConflictDoUpdate({
      target: [dutyResponse.dutyPlanId, dutyResponse.userId],
      set: { lastRemindedAt: now, updatedAt: now },
    });
}
