/**
 * Journal des emails (table notification_log) : statuts d'un envoi.
 *
 * - pending : réservé, envoi en cours (sert aussi de verrou contre un double envoi) ;
 * - sent : accepté par le fournisseur (Brevo en production, Mailpit en local) ;
 * - failed : refusé ou erreur réseau ; un nouvel essai reste possible ;
 * - rate_limited : pas envoyé, trop d'emails d'un coup (limitation de débit).
 */
export const NOTIFICATION_STATUSES = ["pending", "sent", "failed", "rate_limited"] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/**
 * Statuts qui « comptent » pour le dédoublonnage : une relance déjà envoyée (ou en cours) ne
 * repart pas ; après un échec ou une limitation, elle peut repartir.
 */
export const BLOCKING_STATUSES: readonly NotificationStatus[] = ["pending", "sent"];

/** Modèles d'email (colonne template). Une valeur par type d'email envoyé par Pomme. */
export const NOTIFICATION_TEMPLATES = ["magic_link"] as const;

export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

/**
 * Clé de dédoublonnage : un même modèle, pour une même personne et une même occasion, n'est
 * envoyé qu'une fois. L'occasion est par exemple la période de commande d'une relance.
 *
 * @example dedupeKey("order_reminder", "u1", "period-2026-12") // "order_reminder:u1:period-2026-12"
 */
export function dedupeKey(template: string, userId: string, occasion: string): string {
  return `${template}:${userId}:${occasion}`;
}
