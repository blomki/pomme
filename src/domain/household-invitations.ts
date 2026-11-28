/**
 * Invitations dans un foyer (story A3, ADR 0045) : un membre invite une personne par email ; elle
 * reçoit un lien valable 7 jours et ne rejoint le foyer qu'en l'acceptant.
 */

/** Durée de validité du lien d'invitation. */
export const INVITATION_DAYS = 7;

/** Fin de validité d'une invitation envoyée à l'instant `now`. */
export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
}

export type InvitationState = "pending" | "expired" | "accepted" | "cancelled";

/** Où en est une invitation à l'instant `now`. */
export function invitationState(
  invitation: { expiresAt: Date; acceptedAt: Date | null; cancelledAt: Date | null },
  now: Date,
): InvitationState {
  if (invitation.cancelledAt) return "cancelled";
  if (invitation.acceptedAt) return "accepted";
  return invitation.expiresAt <= now ? "expired" : "pending";
}

/**
 * Qui est connecté dans ce navigateur, par rapport à l'adresse invitée (fiche #134) :
 * - "none" : personne ; après l'acceptation, la personne invitée se connecte ;
 * - "invitee" : la personne invitée elle-même ; après l'acceptation, elle va à son espace ;
 * - "other" : un autre compte (souvent un membre du foyer, sur l'ordinateur partagé). On le
 *   signale et on propose de fermer sa session avant d'accepter : sinon, la suite du parcours
 *   reprendrait cette session, et la personne invitée arriverait dans l'espace d'un autre.
 *
 * Les adresses sont comparées sans tenir compte des majuscules (elles sont rangées en minuscules).
 */
export function invitationSessionCase(
  sessionEmail: string | null | undefined,
  invitedEmail: string,
): "none" | "invitee" | "other" {
  if (!sessionEmail) return "none";
  return sessionEmail.trim().toLowerCase() === invitedEmail.trim().toLowerCase()
    ? "invitee"
    : "other";
}
