"use server";

import { revalidatePath } from "next/cache";

import { getDatabase } from "@/db/client";

import { getAmapBySlug } from "./amap";
import { runAmapAction } from "./amap-action";
import { sendCampaign } from "./email/campaigns";
import { reminderNotification } from "./order-reminders";
import {
  closeOrderPeriod,
  planReminders,
  reopenOrderPeriod,
  saveOrderPeriodDates,
  type CloseResult,
  type ReopenResult,
  type SaveDatesResult,
} from "./order-periods";

// Actions du bandeau « Commandes de … » du tableau de bord (story D2). Chacune : contexte de
// l'AMAP de l'adresse, puis fonction de order-periods.ts (qui vérifie le rôle admin).

type Forbidden = { status: "forbidden" };
const dashboardPath = (slug: string) => `/${slug}/admin`;

/** « Fixer les dates » ou « Modifier les dates ». */
export async function saveOrderPeriodDatesAction(
  amap: string,
  input: { month: string; opensOn: string; closesOn: string },
): Promise<SaveDatesResult | Forbidden> {
  const outcome = await runAmapAction(amap, dashboardPath(amap), (tx, ctx) =>
    saveOrderPeriodDates(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(dashboardPath(amap));
  return outcome.result;
}

/** « Clôturer maintenant ». */
export async function closeOrderPeriodAction(
  amap: string,
  periodId: string,
): Promise<CloseResult | Forbidden> {
  const outcome = await runAmapAction(amap, dashboardPath(amap), (tx, ctx) =>
    closeOrderPeriod(tx, ctx, { periodId }),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(dashboardPath(amap));
  return outcome.result;
}

/** « Rouvrir les commandes » jusqu'à un nouveau jour de clôture. */
export async function reopenOrderPeriodAction(
  amap: string,
  input: { periodId: string; closesOn: string },
): Promise<ReopenResult | Forbidden> {
  const outcome = await runAmapAction(amap, dashboardPath(amap), (tx, ctx) =>
    reopenOrderPeriod(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(dashboardPath(amap));
  return outcome.result;
}

export type RemindResult =
  | { status: "sent"; sent: number; skipped: number; failed: number }
  | { status: "not_open" }
  | Forbidden;

/**
 * « Relancer » : un email à chaque membre des foyers sans commande. Une seule relance par
 * personne et par période : la clé de dédoublonnage du journal des emails refuse la deuxième
 * (notification_log, voir email/notify.ts). Chaque email est tracé dans sa propre transaction.
 */
export async function remindHouseholdsAction(
  amap: string,
  periodId: string,
): Promise<RemindResult> {
  const outcome = await runAmapAction(amap, dashboardPath(amap), (tx, ctx) =>
    planReminders(tx, ctx, { periodId }),
  );
  if ("status" in outcome) return outcome;
  const { ctx, result: plan } = outcome;
  if (plan.status !== "ready") return plan;

  const amapRow = await getAmapBySlug(amap);
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const notifications = plan.recipients.map((recipient) =>
    reminderNotification({
      amap: {
        id: ctx.amapId!,
        slug: amap,
        name: amapRow?.name ?? "",
        theme: amapRow?.theme ?? null,
      },
      periodId: plan.periodId,
      month: plan.month,
      closesOn: plan.closesOn,
      recipient,
      baseUrl,
    }),
  );
  // Inscrit dans l'historique des envois (story H1), au nom de l'admin qui relance.
  const { sent, skipped, failed } = await sendCampaign(
    getDatabase(),
    ctx,
    {
      audience: "households_without_order",
      subject: notifications[0]?.content.subject ?? "",
      sentBy: ctx.userId,
      automatic: false,
    },
    notifications,
  );
  const counts = { sent, skipped, failed };
  return { status: "sent", ...counts };
}
