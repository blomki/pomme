import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database, Transaction } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";
import { emailCampaign, notificationLog, producer, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import type { EmailAudience } from "@/domain/email-campaigns";

import { sendNotification, type Notification, type NotifyDeps } from "./notify";

// Envois groupés (story H1, ADR 0046) : chaque envoi à plusieurs personnes est inscrit dans
// l'historique (email_campaign), et chaque email y est relié. Utilisé par l'écran « Emails »
// et par les envois automatiques ou déclenchés ailleurs (relances, disponibilités, planning).

export type CampaignInfo = {
  audience: EmailAudience;
  producerId?: string | null;
  subject: string;
  body?: string;
  /** La personne qui envoie, ou qui a programmé l'envoi automatique. */
  sentBy: string | null;
  automatic: boolean;
  householdCount?: number | null;
};

export type SendCounts = { sent: number; skipped: number; failed: number };

/**
 * Inscrit l'envoi dans l'historique, puis envoie chaque email dans sa propre transaction (un
 * échec n'annule pas les autres). `onSent` : action à faire pour un email parti (par exemple,
 * noter la date de relance). Rien à envoyer : rien n'est inscrit.
 */
export async function sendCampaign(
  db: Database,
  ctx: AmapContext,
  info: CampaignInfo,
  notifications: Array<Omit<Notification, "campaignId">>,
  deps?: NotifyDeps,
  onSent?: (tx: Transaction, notification: Omit<Notification, "campaignId">) => Promise<void>,
): Promise<SendCounts & { campaignId: string | null }> {
  const counts: SendCounts = { sent: 0, skipped: 0, failed: 0 };
  if (notifications.length === 0) return { ...counts, campaignId: null };
  // Identifiant donné ici, insertion sans RETURNING : les tâches automatiques ont le droit
  // d'écrire l'historique, pas de le lire (réservé aux admins).
  const campaignId = uuidv7();
  await withAmapContext(db, ctx, (tx) =>
    tx.insert(emailCampaign).values({
      id: campaignId,
      amapId: ctx.amapId!,
      audience: info.audience,
      producerId: info.producerId ?? null,
      subject: info.subject,
      body: info.body ?? "",
      sentBy: info.sentBy,
      automatic: info.automatic,
      recipientCount: notifications.length,
      householdCount: info.householdCount ?? null,
    }),
  );
  for (const notification of notifications) {
    const result = await withAmapContext(db, ctx, async (tx) => {
      const sent = await sendNotification(tx, { ...notification, campaignId }, deps);
      if (sent.status === "sent" && onSent) await onSent(tx, notification);
      return sent;
    });
    if (result.status === "sent") counts.sent += 1;
    else if (result.status === "duplicate") counts.skipped += 1;
    else counts.failed += 1;
  }
  return { ...counts, campaignId };
}

export type CampaignRow = {
  id: string;
  sentAt: string;
  subject: string;
  audience: EmailAudience;
  producerName: string | null;
  recipientCount: number;
  author: string | null;
  automatic: boolean;
  /** Emails non partis (échec, ou limite de débit). */
  failed: number;
};

/** Historique des envois de l'AMAP courante, du plus récent au plus ancien (admins). */
export async function listCampaigns(tx: Transaction, limit = 50): Promise<CampaignRow[]> {
  const rows = await tx
    .select({
      id: emailCampaign.id,
      sentAt: emailCampaign.sentAt,
      subject: emailCampaign.subject,
      audience: emailCampaign.audience,
      producerName: producer.name,
      recipientCount: emailCampaign.recipientCount,
      firstName: user.firstName,
      lastName: user.lastName,
      automatic: emailCampaign.automatic,
    })
    .from(emailCampaign)
    .leftJoin(producer, eq(producer.id, emailCampaign.producerId))
    .leftJoin(user, eq(user.id, emailCampaign.sentBy))
    .orderBy(desc(emailCampaign.sentAt))
    .limit(limit);
  const ids = rows.map((r) => r.id);
  const failures = ids.length
    ? await tx
        .select({ campaignId: notificationLog.campaignId, n: sql<number>`count(*)::int` })
        .from(notificationLog)
        .where(
          and(
            inArray(notificationLog.campaignId, ids),
            inArray(notificationLog.status, ["failed", "rate_limited"]),
          ),
        )
        .groupBy(notificationLog.campaignId)
    : [];
  return rows.map((r) => ({
    id: r.id,
    sentAt: r.sentAt.toISOString(),
    subject: r.subject,
    audience: r.audience,
    producerName: r.producerName,
    recipientCount: r.recipientCount,
    author: r.firstName !== null ? `${r.firstName} ${r.lastName ?? ""}`.trim() : null,
    automatic: r.automatic,
    failed: failures.find((f) => f.campaignId === r.id)?.n ?? 0,
  }));
}
