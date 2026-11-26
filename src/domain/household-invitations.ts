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
