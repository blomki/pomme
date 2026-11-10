import { eq } from "drizzle-orm";

import type { Database, Transaction } from "@/db/client";
import { notificationLog } from "@/db/schema";
import type { NotificationTemplate } from "@/domain/notifications";

import { createRateLimiter, type RateLimiter } from "../rate-limit";
import { RATE_LIMIT_FACTOR } from "../rate-limit-factor";

import { smtpTransport, type EmailContent, type EmailTransport } from "./mailer";

export type Notification = {
  /** AMAP concernée ; null pour un email de la plateforme (lien de connexion). */
  amapId: string | null;
  /** Compte destinataire, s'il est connu. */
  userId: string | null;
  template: NotificationTemplate;
  /** Même clé = envoyé une seule fois (voir dedupeKey dans domain/notifications). */
  dedupeKey?: string;
  to: string;
  content: EmailContent;
};

export type NotificationResult = {
  status: "sent" | "duplicate" | "rate_limited" | "failed";
  logId?: string;
};

export type NotifyDeps = {
  transport: EmailTransport;
  /** Par destinataire : protège une boîte (et la réputation de l'expéditeur) contre une rafale. */
  recipientLimiter: RateLimiter;
  /** Pour toute la plateforme : reste sous les quotas du fournisseur. */
  globalLimiter: RateLimiter;
};

// En production : 20 emails par heure et par adresse, 100 par minute pour toute la plateforme
// (l'offre gratuite de Brevo permet 300 emails par jour).
const defaultDeps: NotifyDeps = {
  transport: smtpTransport,
  recipientLimiter: createRateLimiter({ limit: 20 * RATE_LIMIT_FACTOR, windowMs: 60 * 60 * 1000 }),
  globalLimiter: createRateLimiter({ limit: 100 * RATE_LIMIT_FACTOR, windowMs: 60 * 1000 }),
};

/**
 * Envoie un email et le trace dans notification_log.
 *
 * 1. Limitation de débit : au-delà, l'email n'est pas envoyé (ligne « rate_limited »).
 * 2. Réservation : une ligne « pending » est écrite AVANT l'envoi. L'index unique sur la clé de
 *    dédoublonnage refuse une deuxième réservation pour la même occasion : une relance n'est
 *    jamais envoyée deux fois, même si deux tâches tournent en même temps.
 * 3. Envoi, puis ligne passée à « sent » (avec l'identifiant chez Brevo) ou « failed » (un
 *    nouvel essai reste alors possible).
 *
 * `db` : pour un email d'AMAP, la connexion de l'application dans withAmapContext (une
 * transaction à part, pour que la trace ne soit pas annulée avec une autre action) ; pour un
 * email de la plateforme, la connexion de Better Auth (pomme_auth).
 */
export async function sendNotification(
  db: Database | Transaction,
  notification: Notification,
  deps: NotifyDeps = defaultDeps,
): Promise<NotificationResult> {
  const base = {
    amapId: notification.amapId,
    userId: notification.userId,
    template: notification.template,
    dedupeKey: notification.dedupeKey ?? null,
  };

  const recipient = notification.to.toLowerCase();
  if (!deps.recipientLimiter.consume(recipient) || !deps.globalLimiter.consume("all")) {
    // Pas de clé de dédoublonnage sur cette ligne : un nouvel essai plus tard reste possible.
    const [row] = await db
      .insert(notificationLog)
      .values({ ...base, dedupeKey: null, status: "rate_limited" })
      .returning({ id: notificationLog.id });
    return { status: "rate_limited", logId: row?.id };
  }

  const [reserved] = await db
    .insert(notificationLog)
    .values({ ...base, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  if (!reserved) return { status: "duplicate" };

  try {
    const { providerId } = await deps.transport.send(notification.to, notification.content);
    await db
      .update(notificationLog)
      .set({ status: "sent", providerId, sentAt: new Date() })
      .where(eq(notificationLog.id, reserved.id));
    return { status: "sent", logId: reserved.id };
  } catch (error) {
    await db
      .update(notificationLog)
      .set({ status: "failed", error: String(error).slice(0, 500) })
      .where(eq(notificationLog.id, reserved.id));
    return { status: "failed", logId: reserved.id };
  }
}
