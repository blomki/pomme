"use server";

import { revalidatePath } from "next/cache";

import { getDatabase } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { dedupeKey, type NotificationTemplate } from "@/domain/notifications";
import { formatDate } from "@/i18n/dates";

import { runAmapAction } from "./amap-action";
import { getAmapBySlug } from "./amap";
import { quarterLabel } from "./duty-notices";
import {
  generateQuarterPlanning,
  planChangeNotice,
  savePlanning,
  sendPlanning,
  type GenerateResult,
  type PlanningNotice,
  type SavePlanningResult,
} from "./duty-planning";
import { dutyPlanningEmail } from "./email/duty-planning-email";
import { sendCampaign } from "./email/campaigns";

// Actions de l'éditeur du planning des permanences (story G2, ADR 0043).

type Forbidden = { status: "forbidden" };

const planningPath = (amap: string) => `/${amap}/admin/planning`;

export type NoticeCounts = { sent: number; skipped: number; failed: number };

/** Envoie à chacun ses dates de permanence, chaque email dans sa propre transaction. */
async function sendNotices(
  amap: string,
  ctx: AmapContext,
  notice: Extract<PlanningNotice, { status: "ready" }>,
  now: Date,
): Promise<NoticeCounts> {
  const amapRow = await getAmapBySlug(amap);
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const template: NotificationTemplate =
    notice.kind === "planning" ? "duty_planning" : "duty_change";
  // Envoi du planning : une fois par planning. Changement : chaque prévenance est une occasion
  // à part (horodatée) ; un double clic ne renvoie rien, car la liste des personnes à prévenir
  // est vidée dans la même transaction que la préparation des emails.
  const occasion =
    notice.kind === "planning" ? notice.planId : `${notice.planId}:${now.toISOString()}`;
  const notifications = notice.recipients.map((r) => ({
    amapId: ctx.amapId!,
    userId: r.userId,
    template,
    dedupeKey: dedupeKey(template, r.userId, occasion),
    to: r.email,
    content: dutyPlanningEmail({
      kind: notice.kind,
      amap: { name: amapRow?.name ?? "", theme: amapRow?.theme ?? null },
      firstName: r.firstName,
      quarter: quarterLabel(notice.quarterStart),
      dates: r.dates.map((d) => formatDate(`${d}T12:00:00Z`, "EEEE d MMMM")),
      url: new URL(`/${amap}/famille`, baseUrl).toString(),
    }),
  }));
  // Inscrit dans l'historique des envois (story H1), au nom de l'admin.
  const { sent, skipped, failed } = await sendCampaign(
    getDatabase(),
    ctx,
    {
      audience: notice.kind === "planning" ? "duty_volunteers" : "duty_changes",
      subject: notifications[0]?.content.subject ?? "",
      sentBy: ctx.userId,
      automatic: false,
    },
    notifications,
  );
  const counts: NoticeCounts = { sent, skipped, failed };
  return counts;
}

/** « Générer le planning » ou « Regénérer » (avant l'envoi). */
export async function generatePlanningAction(
  amap: string,
  quarter: "current" | "next",
): Promise<GenerateResult | Forbidden> {
  const outcome = await runAmapAction(amap, planningPath(amap), (tx, ctx) =>
    generateQuarterPlanning(tx, ctx, { quarter }),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(planningPath(amap), "layout");
  return outcome.result;
}

export type SavePlanningActionResult =
  | (Extract<SavePlanningResult, { status: "saved" }> & { counts: NoticeCounts })
  | Exclude<SavePlanningResult, { status: "saved" }>
  | Forbidden;

/** « Enregistrer » dans l'éditeur, en prévenant ou non les personnes concernées. */
export async function savePlanningAction(
  amap: string,
  input: {
    planId: string;
    notify: boolean;
    rows: Array<{ distributionId: string; userIds: Array<string | null> }>;
  },
): Promise<SavePlanningActionResult> {
  const now = new Date();
  const outcome = await runAmapAction(amap, planningPath(amap), (tx, ctx) =>
    savePlanning(tx, ctx, input, now),
  );
  if ("status" in outcome) return outcome;
  const { ctx, result } = outcome;
  let counts: NoticeCounts = { sent: 0, skipped: 0, failed: 0 };
  if (result.status === "saved" && result.notifyNow.length > 0) {
    const notice = await runAmapAction(amap, planningPath(amap), (tx, c) =>
      planChangeNotice(tx, c, { planId: input.planId, userIds: result.notifyNow }, now),
    );
    if (!("status" in notice) && notice.result.status === "ready") {
      counts = await sendNotices(amap, ctx, notice.result, now);
    }
  }
  revalidatePath(planningPath(amap), "layout");
  return result.status === "saved" ? { ...result, counts } : result;
}

export type NoticeActionResult =
  | { status: "sent"; counts: NoticeCounts }
  | { status: "invalid" | "not_generated" | "not_sent" }
  | Forbidden;

/** « Envoyer le planning aux bénévoles ». */
export async function sendPlanningAction(
  amap: string,
  planId: string,
): Promise<NoticeActionResult> {
  const now = new Date();
  const outcome = await runAmapAction(amap, planningPath(amap), (tx, ctx) =>
    sendPlanning(tx, ctx, { planId }, now),
  );
  if ("status" in outcome) return outcome;
  if (outcome.result.status !== "ready") return outcome.result;
  const counts = await sendNotices(amap, outcome.ctx, outcome.result, now);
  revalidatePath(planningPath(amap), "layout");
  return { status: "sent", counts };
}

/** « Prévenir maintenant » : les personnes des changements enregistrés sans prévenir. */
export async function notifyPendingAction(
  amap: string,
  planId: string,
): Promise<NoticeActionResult> {
  const now = new Date();
  const outcome = await runAmapAction(amap, planningPath(amap), (tx, ctx) =>
    planChangeNotice(tx, ctx, { planId }, now),
  );
  if ("status" in outcome) return outcome;
  if (outcome.result.status !== "ready") return outcome.result;
  const counts = await sendNotices(amap, outcome.ctx, outcome.result, now);
  revalidatePath(planningPath(amap), "layout");
  return { status: "sent", counts };
}
