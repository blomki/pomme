/**
 * Envois groupés (story H1, ADR 0046) : à qui, et ce que l'historique en dit.
 *
 * Audiences :
 * - all_members : tous les adhérents (membres des foyers à l'adhésion active) ;
 * - producer_customers : les clients d'un producteur (foyers qui lui ont commandé le mois en
 *   cours ou ces 3 derniers mois) ;
 * - les envois automatiques ou déclenchés ailleurs : relance des foyers sans commande (D2, D5),
 *   ouverture et relance des disponibilités (G1), envoi et changements du planning (G2).
 */
export const EMAIL_AUDIENCES = [
  "all_members",
  "producer_customers",
  "households_without_order",
  "duty_all",
  "duty_no_answer",
  "duty_volunteers",
  "duty_changes",
] as const;
export type EmailAudience = (typeof EMAIL_AUDIENCES)[number];

/** Mois en arrière pris en compte pour les clients d'un producteur (en plus du mois en cours). */
export const CUSTOMER_MONTHS = 3;
