import { getDatabase } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";

import { getAmapBySlug } from "./amap";
import { invitationEmail, invitationLoginUrl } from "./email/invitation-email";
import { sendNotification } from "./email/notify";
import type { Invitation } from "./households";

// Envoi des invitations d'un foyer (stories A2 et B2). Module ordinaire, pas « use server » :
// appelé par des actions, jamais directement depuis le navigateur.

/**
 * Envoie les invitations, chacune tracée dans le journal des emails (une transaction par
 * email : un échec n'annule pas les autres). Renvoie le nombre d'emails non partis.
 */
export async function sendInvitations(slug: string, ctx: AmapContext, invitations: Invitation[]) {
  const amap = await getAmapBySlug(slug);
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  let failed = 0;
  for (const invitation of invitations) {
    const result = await withAmapContext(getDatabase(), ctx, (tx) =>
      sendNotification(tx, {
        amapId: ctx.amapId,
        userId: invitation.userId,
        template: "invitation",
        to: invitation.email,
        content: invitationEmail({
          amap: { name: amap?.name ?? "", theme: amap?.theme ?? null },
          firstName: invitation.firstName,
          loginUrl: invitationLoginUrl(baseUrl, invitation.email),
        }),
      }),
    );
    if (result.status !== "sent") failed += 1;
  }
  return failed;
}
