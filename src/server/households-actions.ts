"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { account, passkey, session, twoFactor } from "@/db/schema";

import { runAmapAction } from "./amap-action";
import { getAuthInstance } from "./auth/auth";
import {
  addHouseholdMember,
  anonymizeHousehold,
  type AnonymizeResult,
  createHousehold,
  invitationFor,
  setHouseholdArchived,
  setPrimaryContact,
  type AddMemberResult,
  type ArchiveResult,
  type CreateHouseholdResult,
} from "./households";
import { sendInvitations } from "./invitations";
import { saveMemberRoles, type SaveMemberRolesResult } from "./member-roles";

// Actions de l'écran « Foyers et adhésions » (story A2). Chacune : contexte de l'AMAP de
// l'adresse, puis fonction de households.ts (qui vérifie le rôle admin dans la transaction).

const listPath = (slug: string) => `/${slug}/admin/foyers`;

/** Lit les membres saisis dans le formulaire : champs « members.0.email », « members.1.firstName »… */
function membersFromForm(formData: FormData) {
  const indexes = new Set<number>();
  for (const key of formData.keys()) {
    const match = /^members\.(\d+)\./.exec(key);
    if (match) indexes.add(Number(match[1]));
  }
  const primary = formData.get("primary");
  return [...indexes]
    .sort((a, b) => a - b)
    .map((i) => ({
      email: formData.get(`members.${i}.email`),
      firstName: formData.get(`members.${i}.firstName`),
      lastName: formData.get(`members.${i}.lastName`) ?? "",
      phone: formData.get(`members.${i}.phone`) ?? "",
      isPrimary: primary === String(i),
    }));
}

export type CreateHouseholdState =
  | { status: "idle" }
  | { status: "forbidden" }
  | (CreateHouseholdResult & { failedInvitations?: number });

/** « Inviter un foyer » : crée le foyer et ses membres, puis envoie les invitations. */
export async function createHouseholdAction(
  _previous: CreateHouseholdState,
  formData: FormData,
): Promise<CreateHouseholdState> {
  const slug = String(formData.get("amap") ?? "");
  const outcome = await runAmapAction(slug, listPath(slug), (tx, ctx) =>
    createHousehold(tx, ctx, { name: formData.get("name"), members: membersFromForm(formData) }),
  );
  if ("status" in outcome) return outcome;
  const { ctx, result } = outcome;
  if (result.status !== "created") return result;
  const failedInvitations = await sendInvitations(slug, ctx, result.invitations);
  revalidatePath(listPath(slug));
  return { ...result, failedInvitations };
}

export type AddMemberState =
  { status: "idle" } | { status: "forbidden" } | (AddMemberResult & { failedInvitations?: number });

/** « Ajouter un membre » à un foyer, puis invitation. */
export async function addMemberAction(
  _previous: AddMemberState,
  formData: FormData,
): Promise<AddMemberState> {
  const slug = String(formData.get("amap") ?? "");
  const householdId = formData.get("householdId");
  const [member] = membersFromForm(formData);
  const outcome = await runAmapAction(slug, listPath(slug), (tx, ctx) =>
    addHouseholdMember(tx, ctx, { householdId, member }),
  );
  if ("status" in outcome) return outcome;
  const { ctx, result } = outcome;
  if (result.status !== "added") return result;
  const failedInvitations = await sendInvitations(slug, ctx, [result.invitation]);
  revalidatePath(`${listPath(slug)}/${String(householdId)}`);
  return { ...result, failedInvitations };
}

/** Renvoie l'invitation d'une personne qui ne s'est pas encore connectée. */
export async function resendInvitationAction(input: {
  amap: string;
  householdId: string;
  userId: string;
}): Promise<{ status: "sent" | "failed" | "not_found" | "forbidden" }> {
  const outcome = await runAmapAction(input.amap, listPath(input.amap), (tx, ctx) =>
    invitationFor(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  if (!outcome.result) return { status: "not_found" };
  const failed = await sendInvitations(input.amap, outcome.ctx, [outcome.result]);
  return { status: failed === 0 ? "sent" : "failed" };
}

/** Désigne le contact principal du foyer. */
export async function setPrimaryContactAction(input: {
  amap: string;
  householdId: string;
  userId: string;
}): Promise<{ status: "updated" | "invalid" | "not_found" | "forbidden" }> {
  const outcome = await runAmapAction(input.amap, listPath(input.amap), (tx, ctx) =>
    setPrimaryContact(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(`${listPath(input.amap)}/${input.householdId}`);
  return outcome.result;
}

/**
 * Enregistre la fenêtre « Rôles » d'un membre (fiche #138) : administrateur, et référent par
 * producteur. Les fiches des producteurs lisent les mêmes données : elles sont rafraîchies aussi.
 */
export async function saveMemberRolesAction(input: {
  amap: string;
  householdId: string;
  userId: string;
  admin: boolean;
  referentOf: string[];
}): Promise<SaveMemberRolesResult | { status: "forbidden" }> {
  const outcome = await runAmapAction(input.amap, listPath(input.amap), (tx, ctx) =>
    saveMemberRoles(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(`${listPath(input.amap)}/${input.householdId}`);
  revalidatePath(`/${input.amap}/admin/producteurs`, "layout");
  revalidatePath(`/${input.amap}/admin`);
  return outcome.result;
}

/** Archive un foyer, ou le rétablit (« Annuler » du message de confirmation). */
export async function setHouseholdArchivedAction(input: {
  amap: string;
  householdId: string;
  archived: boolean;
}): Promise<ArchiveResult | { status: "forbidden" }> {
  const outcome = await runAmapAction(input.amap, listPath(input.amap), (tx, ctx) =>
    setHouseholdArchived(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(listPath(input.amap));
  revalidatePath(`${listPath(input.amap)}/${input.householdId}`);
  return outcome.result;
}

/**
 * Anonymise un foyer (RGPD, irréversible). Ensuite, pour chaque compte anonymisé, Better Auth
 * (seul autorisé sur ses tables) efface sessions, connexions, passkeys et application
 * d'authentification : plus personne ne peut entrer dans ces comptes.
 */
export async function anonymizeHouseholdAction(input: {
  amap: string;
  householdId: string;
  confirmName: string;
}): Promise<AnonymizeResult | { status: "forbidden" }> {
  const outcome = await runAmapAction(input.amap, listPath(input.amap), (tx, ctx) =>
    anonymizeHousehold(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  const { result } = outcome;
  if (result.status === "anonymized" && result.anonymizedUserIds.length > 0) {
    const ids = result.anonymizedUserIds;
    const authDb = getAuthInstance().db;
    await authDb.transaction(async (tx) => {
      await tx.delete(session).where(inArray(session.userId, ids));
      await tx.delete(account).where(inArray(account.userId, ids));
      await tx.delete(passkey).where(inArray(passkey.userId, ids));
      await tx.delete(twoFactor).where(inArray(twoFactor.userId, ids));
    });
  }
  revalidatePath(listPath(input.amap), "layout");
  return result;
}
