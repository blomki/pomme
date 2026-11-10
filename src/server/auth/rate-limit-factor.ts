/**
 * Multiplicateur des limites de débit de la connexion.
 *
 * Les limites réelles (production) sont faites pour un humain : quelques liens par quart d'heure.
 * Les tests de bout en bout et le développement demandent beaucoup de liens, depuis la même
 * adresse IP (127.0.0.1), pour les mêmes comptes de démonstration : on assouplit les limites
 * avec AUTH_RATE_LIMIT_FACTOR (10 en CI), ou par défaut hors production.
 *
 * Ce facteur s'applique à nos deux limiteurs : le nôtre (demande de lien, voir actions.ts) et
 * celui de Better Auth (ouverture du lien, voir auth.ts), actif seulement en production.
 */
export const AUTH_RATE_LIMIT_FACTOR =
  Number(process.env.AUTH_RATE_LIMIT_FACTOR) || (process.env.NODE_ENV === "production" ? 1 : 10);
