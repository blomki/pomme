/**
 * Pages de démonstration (thème…) : visibles en développement, et dans la CI avec
 * POMME_DEMO_PAGES=1 pour les tests ; jamais en production.
 */
export function demoPagesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POMME_DEMO_PAGES === "1";
}
