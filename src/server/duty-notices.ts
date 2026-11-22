import { and, asc, count, eq, gte, lt } from "drizzle-orm";

import type { Database } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";
import { amap, distribution, dutyPlan, type AmapTheme } from "@/db/schema";
import { addMonths } from "@/domain/distributions";
import { dutyPhase, dutyReminderDue, quarterRange } from "@/domain/duty-plans";
import { dedupeKey } from "@/domain/notifications";
import { parisDay } from "@/domain/order-periods";
import { formatDate } from "@/i18n/dates";

import { dutyPeople, markReminded, planDays, withoutAnswer, type DutyPerson } from "./duty-plans";
import { dutyEmail } from "./email/duty-email";
import { sendNotification, type Notification, type NotifyDeps } from "./email/notify";

// Emails des indisponibilités du trimestre (story G1, ADR 0042) : ouverture de la période de
// réponse, relance automatique 3 jours avant la date limite, relance manuelle de l'admin.
// Dédoublonnage : un email d'ouverture par personne et par planning ; une relance par personne
// et par jour, qu'elle vienne de l'admin ou de la tâche horaire.

export type DutyAmap = { id: string; slug: string; name: string; theme: AmapTheme | null };

/** « janvier à mars 2027 ». */
export function quarterLabel(quarterStart: string): string {
  const month = (m: string) => formatDate(`${m}-01T12:00:00Z`, "MMMM");
  const first = quarterStart.slice(0, 7);
  const last = addMonths(first, 2);
  return `${month(first)} à ${month(last)} ${last.slice(0, 4)}`;
}

/** Email d'une personne, prêt à envoyer. */
export function dutyNotification(params: {
  kind: "opening" | "reminder";
  amap: DutyAmap;
  planId: string;
  quarterStart: string;
  deadlineOn: string;
  distributionCount: number;
  person: Pick<DutyPerson, "userId" | "email" | "firstName">;
  baseUrl: string;
  now: Date;
}): Notification {
  const { person, kind } = params;
  const template = kind === "opening" ? "duty_opening" : "duty_reminder";
  const occasion = kind === "opening" ? params.planId : `${params.planId}:${parisDay(params.now)}`;
  return {
    amapId: params.amap.id,
    userId: person.userId,
    template,
    dedupeKey: dedupeKey(template, person.userId, occasion),
    to: person.email,
    content: dutyEmail({
      kind,
      amap: params.amap,
      firstName: person.firstName,
      quarter: quarterLabel(params.quarterStart),
      deadline: formatDate(`${params.deadlineOn}T12:00:00Z`, "EEEE d MMMM"),
      distributionCount: params.distributionCount,
      url: new URL(`/${params.amap.slug}/famille/disponibilites`, params.baseUrl).toString(),
    }),
  };
}

export type SendCounts = { sent: number; skipped: number; failed: number };

/**
 * Envoie un email à chacun, chaque envoi dans sa propre transaction (un échec n'annule pas les
 * autres). Pour une relance, note la date de relance de la personne si l'email est parti.
 */
export async function sendDutyEmails(
  db: Database,
  ctx: AmapContext,
  params: Omit<Parameters<typeof dutyNotification>[0], "person">,
  people: DutyPerson[],
  deps?: NotifyDeps,
): Promise<SendCounts> {
  const counts: SendCounts = { sent: 0, skipped: 0, failed: 0 };
  for (const person of people) {
    const result = await withAmapContext(db, ctx, async (tx) => {
      const sent = await sendNotification(tx, dutyNotification({ ...params, person }), deps);
      if (sent.status === "sent" && params.kind === "reminder") {
        await markReminded(tx, params.amap.id, params.planId, person.userId, params.now);
      }
      return sent;
    });
    if (result.status === "sent") counts.sent += 1;
    else if (result.status === "duplicate") counts.skipped += 1;
    else counts.failed += 1;
  }
  return counts;
}

export type DutyNoticeReport = SendCounts & {
  amapId: string;
  quarterStart: string;
  kind: "opening" | "reminder";
};

/**
 * Tâche horaire : dans chaque AMAP, pour chaque planning en cours de réponse, l'email
 * d'ouverture (une fois, dès que la période est ouverte), puis la relance automatique des
 * personnes sans réponse, 3 jours avant la date limite (si l'admin la laisse activée).
 */
export async function runDutyNotices(
  db: Database,
  now = new Date(),
  deps?: NotifyDeps,
  baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
): Promise<DutyNoticeReport[]> {
  const amaps = await db
    .select({ id: amap.id, slug: amap.slug, name: amap.name, theme: amap.theme })
    .from(amap)
    .orderBy(asc(amap.id));
  const today = parisDay(now);
  const report: DutyNoticeReport[] = [];
  for (const target of amaps) {
    // Accès de confiance « closing_job » : sans compte connecté, la Row Level Security ne
    // montrerait ni les amapiens ni leurs réponses.
    const ctx: AmapContext = { amapId: target.id, userId: null, trusted: "closing_job" };
    const jobs = await withAmapContext(db, ctx, async (tx) => {
      const plans = await tx.select().from(dutyPlan).where(eq(dutyPlan.status, "collecting"));
      const found = [];
      for (const plan of plans) {
        if (
          dutyPhase({ opensAt: plan.opensAt, deadlineAt: plan.unavailabilityDeadline }, now) !==
          "open"
        )
          continue;
        const { deadlineOn } = planDays(plan);
        const { from, to } = quarterRange(plan.quarterStart);
        const [n] = await tx
          .select({ n: count() })
          .from(distribution)
          .where(
            and(
              gte(distribution.date, from),
              lt(distribution.date, to),
              eq(distribution.isOpen, true),
            ),
          );
        const base = {
          planId: plan.id,
          quarterStart: plan.quarterStart,
          deadlineOn,
          distributionCount: n?.n ?? 0,
        };
        if (!plan.openingNoticeAt) {
          found.push({ ...base, kind: "opening" as const, people: await dutyPeople(tx) });
          await tx.update(dutyPlan).set({ openingNoticeAt: now }).where(eq(dutyPlan.id, plan.id));
        } else if (plan.autoReminder && dutyReminderDue({ deadlineOn, today })) {
          found.push({
            ...base,
            kind: "reminder" as const,
            people: await withoutAnswer(tx, plan.id),
          });
          await tx.update(dutyPlan).set({ lastReminderAt: now }).where(eq(dutyPlan.id, plan.id));
        }
      }
      return found;
    });
    for (const { people, ...job } of jobs) {
      const counts = await sendDutyEmails(
        db,
        ctx,
        { ...job, amap: target, baseUrl, now },
        people,
        deps,
      );
      report.push({ amapId: target.id, quarterStart: job.quarterStart, kind: job.kind, ...counts });
    }
  }
  return report;
}
