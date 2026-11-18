"use server";

import { revalidatePath } from "next/cache";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { dedupeKey } from "@/domain/notifications";
import { formatDate } from "@/i18n/dates";

import { getAmapBySlug } from "./amap";
import { runAmapAction } from "./amap-action";
import { orderReminderEmail } from "./email/order-reminder-email";
import { sendNotification } from "./email/notify";
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
  const month = formatDate(`${plan.month}-01T12:00:00Z`, "MMMM");
  const closesOn = formatDate(`${plan.closesOn}T12:00:00Z`, "EEEE d MMMM");
  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const recipient of plan.recipients) {
    const result = await withAmapContext(getDatabase(), ctx, (tx) =>
      sendNotification(tx, {
        amapId: ctx.amapId,
        userId: recipient.userId,
        template: "order_reminder",
        dedupeKey: dedupeKey("order_reminder", recipient.userId, plan.periodId),
        to: recipient.email,
        content: orderReminderEmail({
          amap: { name: amapRow?.name ?? "", theme: amapRow?.theme ?? null },
          firstName: recipient.firstName,
          month,
          closesOn,
          orderUrl: new URL(`/${amap}/famille`, baseUrl).toString(),
        }),
      }),
    );
    if (result.status === "sent") counts.sent += 1;
    else if (result.status === "duplicate") counts.skipped += 1;
    else counts.failed += 1;
  }
  return { status: "sent", ...counts };
}
