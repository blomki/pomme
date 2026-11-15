"use server";

import { revalidatePath } from "next/cache";

import { getDatabase } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";

import { getAmapBySlug } from "./amap";
import { runAmapAction } from "./amap-action";
import { invitationLoginUrl, producerInvitationEmail } from "./email/invitation-email";
import { sendNotification } from "./email/notify";
import {
  attachProducer,
  inviteProducerAccount,
  producerInvitationFor,
  updateMyProducer,
  type InviteProducerResult,
  type ProducerInvitation,
  createProducer,
  searchProducers,
  setProducerReferents,
  updateProducer,
  type SaveProducerResult,
  type SetReferentsResult,
} from "./producers";

// Actions de l'écran « Producteurs et référents » (story C1). Chacune : contexte de l'AMAP de
// l'adresse, puis fonction de producers.ts (qui vérifie le rôle admin dans la transaction).

const listPath = (slug: string) => `/${slug}/admin/producteurs`;

type Forbidden = { status: "forbidden" };

/** Les écrans de l'admin (liste, fiche, tableau de bord) affichent ces données. */
function refresh(slug: string) {
  revalidatePath(`/${slug}/admin`, "layout");
}

/** « Créer un producteur » : fiche commune et réglages dans l'AMAP. */
export async function createProducerAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveProducerResult | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    createProducer(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  refresh(amap);
  return outcome.result;
}

/** Recherche d'un producteur existant à rattacher (nom et catégorie seulement). */
export async function searchProducersAction(
  amap: string,
  query: string,
): Promise<Array<{ id: string; name: string; category: string }> | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    searchProducers(tx, ctx, query),
  );
  return "status" in outcome ? outcome : outcome.result;
}

/** « Rattacher » un producteur qui livre déjà une autre AMAP. */
export async function attachProducerAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveProducerResult | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    attachProducer(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  refresh(amap);
  return outcome.result;
}

/** Enregistre la fiche et les réglages d'un producteur. */
export async function updateProducerAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveProducerResult | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    updateProducer(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  refresh(amap);
  return outcome.result;
}

/** Enregistre les référents d'un producteur. */
export async function setProducerReferentsAction(
  amap: string,
  input: { amapProducerId: string; userIds: string[] },
): Promise<SetReferentsResult | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    setProducerReferents(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  refresh(amap);
  return outcome.result;
}

/** Envoie l'invitation d'un compte producteur, tracée dans le journal des emails. */
async function sendProducerInvitation(
  slug: string,
  ctx: AmapContext,
  invitation: ProducerInvitation,
): Promise<boolean> {
  const amap = await getAmapBySlug(slug);
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const result = await withAmapContext(getDatabase(), ctx, (tx) =>
    sendNotification(tx, {
      amapId: ctx.amapId,
      userId: invitation.userId,
      template: "producer_invitation",
      to: invitation.email,
      content: producerInvitationEmail({
        amap: { name: amap?.name ?? "", theme: amap?.theme ?? null },
        firstName: invitation.firstName,
        producerName: invitation.producerName,
        loginUrl: invitationLoginUrl(baseUrl, invitation.email),
      }),
    }),
  );
  return result.status === "sent";
}

/** « Inviter un compte producteur » : crée ou rattache le compte, puis envoie l'invitation. */
export async function inviteProducerAccountAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<(InviteProducerResult & { sent?: boolean }) | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    inviteProducerAccount(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  const { ctx, result } = outcome;
  if (result.status !== "invited") return result;
  const sent = await sendProducerInvitation(amap, ctx, result.invitation);
  refresh(amap);
  return { ...result, sent };
}

/** Renvoie l'invitation d'un compte producteur qui ne s'est jamais connecté. */
export async function resendProducerInvitationAction(
  amap: string,
  input: { amapProducerId: string; userId: string },
): Promise<{ status: "sent" | "failed" | "not_found" } | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    producerInvitationFor(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  if (!outcome.result) return { status: "not_found" };
  const sent = await sendProducerInvitation(amap, outcome.ctx, outcome.result);
  return { status: sent ? "sent" : "failed" };
}

/** Le référent enregistre les coordonnées et l'ordre des chèques de son producteur (R5). */
export async function updateMyProducerAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveProducerResult | Forbidden> {
  const outcome = await runAmapAction(amap, `/${amap}/referent/producteurs`, (tx, ctx) =>
    updateMyProducer(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(`/${amap}/referent/producteurs`);
  refresh(amap);
  return outcome.result;
}
