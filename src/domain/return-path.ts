/**
 * Adresse de retour sûre : un chemin de Pomme (« /hommesdeterre/admin »), jamais un autre site
 * (« //exemple.com », « https://… »), pour qu'un lien piégé ne puisse pas emmener ailleurs.
 */
export function safeReturnPath(value: unknown, fallback = "/compte"): string {
  if (typeof value !== "string") return fallback;
  return /^\/(?![/\\])[^\s]*$/.test(value) ? value : fallback;
}
