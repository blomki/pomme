"use server";

import { revalidatePath } from "next/cache";

import { getDatabase } from "@/db/client";

import { runAmapAction } from "./amap-action";
import { getAmapBySlug } from "./amap";
import { sendDutyEmails } from "./duty-notices";
import {
  planDutyReminders,
  saveDutyPlan,
  saveMyAvailability,
  type SaveAvailabilityResult,
  type SaveDutyPlanResult,
} from "./duty-plans";

// Actions des indisponibilités du trimestre (story G1, ADR 0042).

type Forbidden = { status: "forbidden" };

const adminPath = (amap: string) => `/${amap}/admin/planning/disponibilites`;
const familyPath = (amap: string) => `/${amap}/famille/disponibilites`;

/** « Envoyer » sur « Mes disponibilités » : seulement ses propres dates, pendant la période. */
export async function saveMyAvailabilityAction(
  amap: string,
  input: { planId: string; distributionIds: string[] },
): Promise<SaveAvailabilityResult | Forbidden> {
  const outcome = await runAmapAction(amap, familyPath(amap), (tx, ctx) =>
    saveMyAvailability(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(`/${amap}/famille`, "layout");
  return outcome.result;
}

/** Période de réponse du trimestre (écran A8). */
export async function saveDutyPlanAction(
  amap: string,
  input: { quarterStart: string; opensOn: string; deadlineOn: string; autoReminder: boolean },
): Promise<SaveDutyPlanResult | Forbidden> {
  const outcome = await runAmapAction(amap, adminPath(amap), (tx, ctx) =>
    saveDutyPlan(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(adminPath(amap));
  return outcome.result;
}

export type DutyRemindResult =
  | { status: "sent"; sent: number; skipped: number; failed: number }
  | { status: "not_open" | "invalid" }
  | Forbidden;

/**
 * « Relancer les N sans réponse » ou « Relancer » une personne. Une relance par personne et
 * par jour au plus ; chaque email dans sa propre transaction.
 */
export async function remindDutyAction(
  amap: string,
  input: { planId: string; userId?: string },
): Promise<DutyRemindResult> {
  const now = new Date();
  const outcome = await runAmapAction(amap, adminPath(amap), (tx, ctx) =>
    planDutyReminders(tx, ctx, input, now),
  );
  if ("status" in outcome) return outcome;
  const { ctx, result: plan } = outcome;
  if (plan.status !== "ready") return plan;
  const amapRow = await getAmapBySlug(amap);
  const counts = await sendDutyEmails(
    getDatabase(),
    ctx,
    {
      kind: "reminder",
      amap: {
        id: ctx.amapId!,
        slug: amap,
        name: amapRow?.name ?? "",
        theme: amapRow?.theme ?? null,
      },
      planId: plan.planId,
      quarterStart: plan.quarterStart,
      deadlineOn: plan.deadlineOn,
      distributionCount: plan.distributionCount,
      baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      now,
    },
    plan.recipients,
    undefined,
    { sentBy: ctx.userId, automatic: false },
  );
  revalidatePath(adminPath(amap));
  return { status: "sent", ...counts };
}
