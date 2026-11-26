"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";
import type { AmapTheme } from "@/db/schema";

import { createAmap, type CreateAmapResult } from "./amap-creation";
import { getAuthInstance } from "./auth/auth";
import { clearSecondFactor } from "./auth/devices";
import { ForbiddenError } from "./auth/errors";
import { getSecondFactorState, verificationUrl } from "./auth/second-factor";
import { adminInvitationEmail, invitationLoginUrl } from "./email/invitation-email";
import { sendNotification } from "./email/notify";
import {
  findPlatformAccount,
  resetSecondFactorFromPlatform,
  type FindAccountResult,
  type PlatformResetResult,
} from "./platform-accounts";

// Actions de l'espace du gestionnaire de la plateforme (stories J1 et S10b). Chacune : connexion,
// deuxième vérification, compte gestionnaire ; les fonctions de base (create_amap,
// platform_find_account, platform_reset_second_factor) refont le contrôle du compte.

const NEW_AMAP_PATH = "/plateforme/amaps/nouvelle";
const ACCOUNTS_PATH = "/plateforme/comptes";

/**
 * Contexte d'un gestionnaire de la plateforme, hors de toute AMAP ; null pour un autre compte.
 * Sans connexion ou sans deuxième vérification, renvoie vers la page qui convient.
 */
async function platformContext(returnPath: string): Promise<AmapContext | null> {
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  if (state.status === "challenge" || state.status === "enroll") {
    redirect(verificationUrl(returnPath));
  }
  if (!state.factors.isPlatformAdmin) return null;
  return { amapId: null, userId: state.user.id, secondFactorVerified: state.verified };
}

/** Retrouver un compte par son email (story S10b). */
export async function findAccountAction(input: {
  email: string;
}): Promise<FindAccountResult | { status: "forbidden" }> {
  const ctx = await platformContext(ACCOUNTS_PATH);
  if (!ctx) return { status: "forbidden" };
  try {
    return await withAmapContext(getDatabase(), ctx, (tx, c) => findPlatformAccount(tx, c, input));
  } catch (error) {
    if (error instanceof ForbiddenError) return { status: "forbidden" };
    throw error;
  }
}

/**
 * Réinitialiser la deuxième vérification d'un compte (story S10b, ADR 0047) : facteurs retirés,
 * sessions fermées, inscrit au journal de la plateforme.
 */
export async function platformResetSecondFactorAction(input: {
  userId: string;
}): Promise<PlatformResetResult | { status: "forbidden" }> {
  const ctx = await platformContext(ACCOUNTS_PATH);
  if (!ctx) return { status: "forbidden" };
  try {
    return await withAmapContext(getDatabase(), ctx, (tx, c) =>
      resetSecondFactorFromPlatform(tx, c, input, (userId) =>
        clearSecondFactor(getAuthInstance().db, userId),
      ),
    );
  } catch (error) {
    if (error instanceof ForbiddenError) return { status: "forbidden" };
    throw error;
  }
}

export type CreateAmapActionResult =
  | (Extract<CreateAmapResult, { status: "created" }> & { invitationSent: boolean })
  | Exclude<CreateAmapResult, { status: "created" }>
  | { status: "forbidden" };

/**
 * Crée l'AMAP (une transaction), puis envoie l'invitation à son premier administrateur, tracée
 * dans le journal des emails de la nouvelle AMAP. Un email qui ne part pas n'annule pas la
 * création : l'écran le signale.
 */
export async function createAmapAction(input: {
  name: string;
  slug: string;
  primary: string;
  secondary: string;
  tertiary: string;
  headingFont: string;
  place: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  contactEmail: string;
  admin: { email: string; firstName: string; lastName: string };
}): Promise<CreateAmapActionResult> {
  const ctx = await platformContext(NEW_AMAP_PATH);
  if (!ctx) return { status: "forbidden" };
  let result: CreateAmapResult;
  try {
    result = await withAmapContext(getDatabase(), ctx, (tx, c) => createAmap(tx, c, input));
  } catch (error) {
    if (error instanceof ForbiddenError) return { status: "forbidden" };
    throw error;
  }
  if (result.status !== "created") return result;

  const theme: AmapTheme = {
    primary: input.primary,
    secondary: input.secondary,
    tertiary: input.tertiary,
    headingFont: input.headingFont,
  };
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const sent = await withAmapContext(getDatabase(), { ...ctx, amapId: result.amapId }, (tx) =>
    sendNotification(tx, {
      amapId: result.amapId,
      userId: result.adminUserId,
      template: "admin_invitation",
      to: input.admin.email,
      content: adminInvitationEmail({
        amap: { name: input.name.trim(), theme },
        firstName: input.admin.firstName.trim(),
        loginUrl: invitationLoginUrl(baseUrl, input.admin.email.trim().toLowerCase()),
      }),
    }),
  );
  revalidatePath("/plateforme");
  return { ...result, invitationSent: sent.status === "sent" };
}
