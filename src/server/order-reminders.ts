import { asc, ne } from "drizzle-orm";

import type { Database } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";
import { amap, orderPeriod, type AmapTheme } from "@/db/schema";
import { effectiveParameters } from "@/domain/amap-settings";
import { dedupeKey } from "@/domain/notifications";
import { effectiveStatus, parisDay, periodDays, reminderDue } from "@/domain/order-periods";
import { formatDate } from "@/i18n/dates";

import { sendCampaign } from "./email/campaigns";
import { type Notification, type NotifyDeps } from "./email/notify";
import { orderReminderEmail } from "./email/order-reminder-email";
import { reminderRecipients, type ReminderRecipient } from "./order-periods";

// Rappels avant la clôture des commandes : « Relancer » de l'admin (story D2) et rappel
// automatique de la tâche planifiée (story D5, ADR 0038). Une seule relance par personne et
// par période, quelle que soit son origine : même clé de dédoublonnage du journal des emails.

/** Email de rappel d'une personne, prêt à envoyer. */
export function reminderNotification(params: {
  amap: { id: string; slug: string; name: string; theme: AmapTheme | null };
  periodId: string;
  month: string;
  closesOn: string;
  recipient: ReminderRecipient;
  baseUrl: string;
}): Notification {
  const { recipient } = params;
  return {
    amapId: params.amap.id,
    userId: recipient.userId,
    template: "order_reminder",
    dedupeKey: dedupeKey("order_reminder", recipient.userId, params.periodId),
    to: recipient.email,
    content: orderReminderEmail({
      amap: { name: params.amap.name, theme: params.amap.theme },
      firstName: recipient.firstName,
      month: formatDate(`${params.month}-01T12:00:00Z`, "MMMM"),
      closesOn: formatDate(`${params.closesOn}T12:00:00Z`, "EEEE d MMMM"),
      orderUrl: new URL(`/${params.amap.slug}/famille`, params.baseUrl).toString(),
    }),
  };
}

export type ReminderReport = {
  amapId: string;
  month: string;
  sent: number;
  skipped: number;
  failed: number;
};

/**
 * Rappel automatique (tâche planifiée, une fois par heure) : dans chaque AMAP, pour la période
 * ouverte dont la clôture approche (réglage « Rappel avant la clôture », 2 jours par défaut),
 * un email à chaque membre des foyers sans commande. Les passages suivants ne renvoient rien :
 * la clé de dédoublonnage refuse un deuxième rappel (y compris après un « Relancer » manuel).
 */
export async function runOrderReminders(
  db: Database,
  now = new Date(),
  deps?: NotifyDeps,
  baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
): Promise<ReminderReport[]> {
  const amaps = await db
    .select({
      id: amap.id,
      slug: amap.slug,
      name: amap.name,
      theme: amap.theme,
      settings: amap.settings,
    })
    .from(amap)
    .orderBy(asc(amap.id));
  const today = parisDay(now);
  const report: ReminderReport[] = [];
  for (const target of amaps) {
    const daysBefore = effectiveParameters(target.settings).orderReminderDays;
    // Accès de confiance « closing_job » : sans compte connecté, la Row Level Security ne
    // montrerait ni foyers ni commandes (S12, S13).
    const ctx: AmapContext = { amapId: target.id, userId: null, trusted: "closing_job" };
    const plans = await withAmapContext(db, ctx, async (tx) => {
      const periods = await tx
        .select()
        .from(orderPeriod)
        .where(ne(orderPeriod.status, "closed"))
        .orderBy(asc(orderPeriod.month));
      const due = periods.filter(
        (p) =>
          effectiveStatus(p, now) === "open" &&
          reminderDue({ closesOn: periodDays(p).closesOn, today, daysBefore }),
      );
      return Promise.all(
        due.map(async (p) => ({
          periodId: p.id,
          // Auteur de l'envoi automatique dans l'historique : qui a créé la période (H1).
          createdBy: p.createdBy,
          month: p.month.slice(0, 7),
          closesOn: periodDays(p).closesOn,
          recipients: await reminderRecipients(tx, p.month.slice(0, 7)),
        })),
      );
    });
    for (const { createdBy, ...plan } of plans) {
      const notifications = plan.recipients.map((recipient) =>
        reminderNotification({ amap: target, ...plan, recipient, baseUrl }),
      );
      const { sent, skipped, failed } = await sendCampaign(
        db,
        ctx,
        {
          audience: "households_without_order",
          subject: notifications[0]?.content.subject ?? "",
          sentBy: createdBy,
          automatic: true,
        },
        notifications,
        deps,
      );
      const counts = { sent, skipped, failed };
      report.push({ amapId: target.id, month: plan.month, ...counts });
    }
  }
  return report;
}
