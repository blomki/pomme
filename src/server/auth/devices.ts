import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { and, count, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { knownDevice, passkey, session, twoFactor, user } from "@/db/schema";
import { describeDevice, shouldAlert } from "@/domain/devices";
import { dedupeKey } from "@/domain/notifications";
import { formatDate } from "@/i18n/dates";

import type { Notification } from "../email/notify";
import { newDeviceEmail } from "../email/new-device-email";

// Appareils connus et alerte de connexion (story S10, ADR 0041).

/** Durée de validité du lien « Déconnecter tous mes appareils » : 7 jours. */
const REVOKE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Empreinte du cookie d'appareil : la base ne garde jamais le cookie lui-même. */
export function deviceHash(deviceId: string): string {
  return createHash("sha256").update(deviceId).digest("hex");
}

export type SignInResult = "first" | "known" | "new";

/**
 * Note la connexion d'un compte depuis un appareil. Appareil inconnu, et pas le premier du
 * compte : prépare l'email d'alerte (`alert`). Avec la connexion de l'application, dans le
 * contexte du compte (la Row Level Security de known_device ne montre que ses appareils).
 */
export async function recordSignIn(
  appDb: Database,
  params: {
    userId: string;
    email: string;
    firstName: string;
    deviceId: string;
    userAgent: string | null;
    baseUrl: string;
    secret: string;
    now?: Date;
  },
  alert: (notification: Notification) => Promise<unknown>,
): Promise<SignInResult> {
  const now = params.now ?? new Date();
  const hash = deviceHash(params.deviceId);
  const label = describeDevice(params.userAgent);
  const result = await withAmapContext(
    appDb,
    { amapId: null, userId: params.userId },
    async (tx): Promise<SignInResult> => {
      const [known] = await tx
        .select({ id: knownDevice.id })
        .from(knownDevice)
        .where(and(eq(knownDevice.userId, params.userId), eq(knownDevice.deviceHash, hash)));
      if (known) {
        await tx.update(knownDevice).set({ lastSeenAt: now }).where(eq(knownDevice.id, known.id));
        return "known";
      }
      const [others] = await tx
        .select({ n: count() })
        .from(knownDevice)
        .where(eq(knownDevice.userId, params.userId));
      await tx
        .insert(knownDevice)
        .values({ userId: params.userId, deviceHash: hash, label, lastSeenAt: now })
        .onConflictDoNothing();
      return shouldAlert({ known: false, otherDevices: others?.n ?? 0 }) ? "new" : "first";
    },
  );
  if (result === "new") {
    const token = signRevokeToken(params.userId, now, params.secret);
    const revokeUrl = new URL(`/connexion/deconnecter?jeton=${token}`, params.baseUrl).toString();
    await alert({
      amapId: null,
      userId: params.userId,
      template: "new_device",
      dedupeKey: dedupeKey("new_device", params.userId, hash.slice(0, 16)),
      to: params.email,
      content: newDeviceEmail({
        firstName: params.firstName,
        device: label,
        when: formatDate(now.toISOString(), "EEEE d MMMM 'à' HH'h'mm"),
        revokeUrl,
      }),
    });
  }
  return result;
}

/**
 * Jeton du lien « Déconnecter tous mes appareils » : identifiant du compte et date de fin,
 * signés avec le secret de l'application (HMAC-SHA256). Il ne donne aucun accès au compte :
 * il permet seulement d'en fermer les sessions.
 */
export function signRevokeToken(userId: string, now: Date, secret: string): string {
  const payload = `${userId}.${now.getTime() + REVOKE_TTL_MS}`;
  const signature = createHmac("sha256", secret).update(`revoke:${payload}`).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

/** Compte du jeton s'il est authentique et encore valable, sinon null. */
export function verifyRevokeToken(token: string, now: Date, secret: string): string | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = createHmac("sha256", secret).update(`revoke:${payload}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [userId, expires] = payload.split(".");
  if (!userId || !expires || Number(expires) < now.getTime()) return null;
  return userId;
}

/**
 * Ferme toutes les sessions d'un compte, avec la connexion de Better Auth (seule à pouvoir
 * toucher la table des sessions). Renvoie le nombre de sessions fermées.
 */
export async function revokeAllSessions(authDb: Database, userId: string): Promise<number> {
  const removed = await authDb
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });
  return removed.length;
}

/**
 * Retire tout deuxième facteur d'un compte (application d'authentification, passkeys) et le
 * déconnecte partout (story S10). Connexion de Better Auth : seule à toucher ces tables.
 * Appelée seulement après les contrôles de resetMemberSecondFactor.
 */
export async function clearSecondFactor(authDb: Database, userId: string): Promise<void> {
  await authDb.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    await tx.delete(passkey).where(eq(passkey.userId, userId));
    await tx
      .update(user)
      .set({ twoFactorEnabled: false, updatedAt: new Date() })
      .where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
  });
}
