"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { dedupeKey } from "@/domain/notifications";

import { runAmapAction } from "./amap-action";
import { getAmapBySlug } from "./amap";
import { getCurrentSession } from "./auth/session";
import { householdInvitationEmail, memberRemovedEmail } from "./email/household-emails";
import { sendNotification } from "./email/notify";
import {
  acceptInvitation,
  cancelInvitation,
  getMyProfile,
  inviteToHousehold,
  removeHouseholdMember,
  setPreferredSpace,
  updateMyProfile,
  type AcceptResult,
  type UpdateProfileResult,
} from "./my-account";
import { listMySpaces } from "./spaces";

// Actions de « Mon profil » (story A3, ADR 0045).

const PROFILE_PATH = "/compte";

/** Connexion requise : sinon, page de connexion. */
async function signedIn() {
  const current = await getCurrentSession();
  if (!current) redirect("/connexion");
  return current;
}

/** « Enregistrer » mes informations. */
export async function updateProfileAction(input: {
  firstName: string;
  lastName: string;
  phone: string;
}): Promise<UpdateProfileResult> {
  const current = await signedIn();
  const result = await withAmapContext(
    getDatabase(),
    { amapId: null, userId: current.user.id },
    (tx, ctx) => updateMyProfile(tx, ctx, input),
  );
  if (result.status === "saved") revalidatePath(PROFILE_PATH, "layout");
  return result;
}

/** Changer de mode : mémorisé, puis ouverture de l'espace choisi. */
export async function setModeAction(
  value: string,
): Promise<{ status: "saved"; path: string } | { status: "invalid" }> {
  const current = await signedIn();
  const { amapSpaces } = await listMySpaces(current.user.id);
  return withAmapContext(getDatabase(), { amapId: null, userId: current.user.id }, (tx, ctx) =>
    setPreferredSpace(tx, ctx, value, amapSpaces),
  );
}

export type InviteActionResult =
  | { status: "invited"; email: string; sent: boolean }
  | { status: "invalid" | "self" | "already_member" | "already_invited" | "no_household" }
  | { status: "forbidden" };

/** « Envoyer l'invitation » : lien valable 7 jours, par email. */
export async function inviteMemberAction(amap: string, email: string): Promise<InviteActionResult> {
  const outcome = await runAmapAction(amap, PROFILE_PATH, (tx, ctx) =>
    inviteToHousehold(tx, ctx, { email }),
  );
  if ("status" in outcome) return outcome;
  const { ctx, result } = outcome;
  if (result.status !== "invited") return result;
  const amapRow = await getAmapBySlug(amap);
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = new URL("/connexion/invitation", baseUrl);
  url.searchParams.set("jeton", result.token);
  const sent = await withAmapContext(getDatabase(), ctx, (tx) =>
    sendNotification(tx, {
      amapId: ctx.amapId,
      userId: null,
      template: "household_invitation",
      dedupeKey: dedupeKey("household_invitation", result.email, result.token.slice(0, 16)),
      to: result.email,
      content: householdInvitationEmail({
        amap: { name: amapRow?.name ?? "", theme: amapRow?.theme ?? null },
        inviterName: result.inviterName,
        householdName: result.householdName,
        url: url.toString(),
      }),
    }),
  );
  revalidatePath(PROFILE_PATH);
  return { status: "invited", email: result.email, sent: sent.status === "sent" };
}

/** « Annuler l'invitation ». */
export async function cancelInvitationAction(
  amap: string,
  invitationId: string,
): Promise<{ status: "cancelled" | "not_found" | "forbidden" }> {
  const outcome = await runAmapAction(amap, PROFILE_PATH, (tx, ctx) =>
    cancelInvitation(tx, ctx, { invitationId }),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(PROFILE_PATH);
  return outcome.result;
}

/** « Retirer » un membre de mon foyer ; il en est informé par email. */
export async function removeMemberAction(
  amap: string,
  userId: string,
): Promise<{ status: "removed" | "self" | "not_found" | "forbidden" }> {
  const outcome = await runAmapAction(amap, PROFILE_PATH, async (tx, ctx) => ({
    removal: await removeHouseholdMember(tx, ctx, { userId }),
    me: await getMyProfile(tx, ctx),
  }));
  if ("status" in outcome) return outcome;
  const { ctx, result } = outcome;
  const { removal, me } = result;
  if (removal.status === "removed") {
    const amapRow = await getAmapBySlug(amap);
    await withAmapContext(getDatabase(), ctx, (tx) =>
      sendNotification(tx, {
        amapId: ctx.amapId,
        userId: null,
        template: "member_removed",
        to: removal.email,
        content: memberRemovedEmail({
          amap: { name: amapRow?.name ?? "", theme: amapRow?.theme ?? null },
          firstName: removal.firstName,
          householdName: removal.householdName,
          removedBy: `${me.firstName} ${me.lastName}`.trim(),
        }),
      }),
    );
    revalidatePath(PROFILE_PATH);
  }
  return { status: removal.status };
}

export type AcceptState = { status: "idle" } | AcceptResult;

/** « Rejoindre le foyer » (page de l'invitation, sans connexion). */
export async function acceptInvitationAction(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  return acceptInvitation(getDatabase(), {
    token: String(formData.get("jeton") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
  });
}
