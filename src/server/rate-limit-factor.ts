/**
 * Multiplicateur des limites de débit (connexion, codes, envoi d'emails).
 *
 * Les limites réelles (production) sont faites pour un humain : quelques liens par quart
 * d'heure, quelques emails par heure. Les tests de bout en bout et le développement en
 * demandent beaucoup plus, depuis la même adresse IP (127.0.0.1), pour les mêmes comptes de
 * démonstration : on assouplit toutes les limites avec RATE_LIMIT_FACTOR (10 en CI), ou par
 * défaut hors production.
 *
 * S'applique à nos limiteurs (demande de lien, codes de vérification, emails) et à celui de
 * Better Auth (ouverture du lien), actif seulement en production.
 */
export const RATE_LIMIT_FACTOR =
  Number(process.env.RATE_LIMIT_FACTOR) || (process.env.NODE_ENV === "production" ? 1 : 10);
