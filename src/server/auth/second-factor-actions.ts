"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { safeReturnPath } from "@/domain/return-path";
import { normalizeTotpCode } from "@/domain/second-factor";

import { createRateLimiter } from "../rate-limit";

import { getAuthInstance } from "./auth";
import { RATE_LIMIT_FACTOR } from "../rate-limit-factor";
import { markSessionVerified } from "./second-factor-facts";
import { getCurrentSession } from "./session";
import { verifySecondFactor, type VerifySecondFactorState } from "./verify-second-factor";

// 5 codes par compte et par quart d'heure : deviner un code à 6 chiffres devient impossible.
const codeLimiter = createRateLimiter({
  limit: 5 * RATE_LIMIT_FACTOR,
  windowMs: 15 * 60 * 1000,
});

/** Vrai si Better Auth accepte l'appel ; faux s'il le refuse (code faux, etc.). */
async function succeeds(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return true;
  } catch {
    return false;
  }
}

/**
 * Formulaire « Code de l'application » ou « Code de secours » de /connexion/verification.
 * Si le code est juste, retour vers la page demandée (champ caché « retour »).
 */
export async function verifySecondFactorAction(
  _previous: VerifySecondFactorState,
  formData: FormData,
): Promise<VerifySecondFactorState> {
  const requestHeaders = await headers();
  const current = await getCurrentSession();
  if (!current) redirect("/connexion");
  const { auth, db } = getAuthInstance();

  const state = await verifySecondFactor(
    { method: formData.get("method"), code: formData.get("code") },
    {
      limiter: codeLimiter,
      userId: current.user.id,
      verifyTotp: (code) =>
        succeeds(() => auth.api.verifyTOTP({ body: { code }, headers: requestHeaders })),
      verifyBackupCode: (code) =>
        succeeds(() => auth.api.verifyBackupCode({ body: { code }, headers: requestHeaders })),
      markVerified: () => markSessionVerified(db, current.session.token),
    },
  );
  if (state.status === "verified") redirect(safeReturnPath(formData.get("retour")));
  return state;
}

export type TotpSetup =
  { status: "ready"; qrCode: string; key: string; backupCodes: string[] } | { status: "error" };

/**
 * Première étape de l'activation de l'application d'authentification : Better Auth crée le
 * secret (pas encore actif) et les codes de secours. On renvoie le QR code à scanner, la clé à
 * saisir à la main si besoin, et les codes de secours (affichés après le premier code juste).
 */
export async function startTotpSetupAction(): Promise<TotpSetup> {
  const { auth } = getAuthInstance();
  try {
    const result = await auth.api.enableTwoFactor({ body: {}, headers: await headers() });
    if (!("totpURI" in result)) return { status: "error" };
    const key = new URL(result.totpURI).searchParams.get("secret") ?? "";
    const qrCode = await QRCode.toDataURL(result.totpURI, { margin: 1, width: 200 });
    return { status: "ready", qrCode, key, backupCodes: result.backupCodes };
  } catch {
    return { status: "error" };
  }
}

export type ConfirmTotpState = {
  status: "idle" | "invalid_format" | "wrong_code" | "rate_limited" | "confirmed";
};

/**
 * Deuxième étape : le premier code juste active l'application. Better Auth ouvre alors une
 * nouvelle session, notée comme vérifiée (voir databaseHooks dans auth.ts).
 */
export async function confirmTotpSetupAction(
  _previous: ConfirmTotpState,
  formData: FormData,
): Promise<ConfirmTotpState> {
  const raw = formData.get("code");
  const code = typeof raw === "string" ? normalizeTotpCode(raw) : null;
  if (!code) return { status: "invalid_format" };
  const current = await getCurrentSession();
  if (!current) redirect("/connexion");
  if (!codeLimiter.consume(current.user.id)) return { status: "rate_limited" };
  const { auth } = getAuthInstance();
  const requestHeaders = await headers();
  const ok = await succeeds(() => auth.api.verifyTOTP({ body: { code }, headers: requestHeaders }));
  return { status: ok ? "confirmed" : "wrong_code" };
}

/** « Désactiver l'application d'authentification » (Mon compte). */
export async function disableTotpAction(): Promise<void> {
  const { auth } = getAuthInstance();
  await auth.api.disableTwoFactor({ body: {}, headers: await headers() });
  redirect("/compte?application=desactivee");
}
