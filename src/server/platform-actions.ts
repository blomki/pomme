"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import type { AmapTheme } from "@/db/schema";

import { createAmap, type CreateAmapResult } from "./amap-creation";
import { ForbiddenError } from "./auth/errors";
import { getSecondFactorState, verificationUrl } from "./auth/second-factor";
import { adminInvitationEmail, invitationLoginUrl } from "./email/invitation-email";
import { sendNotification } from "./email/notify";

// Actions de l'espace du gestionnaire de la plateforme (story J1). Chacune : connexion, deuxième
// vérification, compte gestionnaire ; la fonction de base create_amap refait le contrôle.

const NEW_AMAP_PATH = "/plateforme/amaps/nouvelle";

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
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  if (state.status === "challenge" || state.status === "enroll") {
    redirect(verificationUrl(NEW_AMAP_PATH));
  }
  if (!state.factors.isPlatformAdmin) return { status: "forbidden" };

  const ctx = { amapId: null, userId: state.user.id, secondFactorVerified: state.verified };
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
