/**
 * Adresse IP du visiteur, pour la limitation de débit. Derrière l'hébergeur, l'adresse réelle
 * est le premier élément de X-Forwarded-For (ajouté par le répartiteur de charge).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "inconnue";
}
