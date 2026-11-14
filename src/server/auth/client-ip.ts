/**
 * Adresse IP du visiteur, pour la limitation de débit.
 *
 * Derrière Clever Cloud, le répartiteur de charge (Sōzu) AJOUTE l'adresse qu'il voit à la fin
 * de l'en-tête X-Forwarded-For, à la suite de ce que le visiteur a pu envoyer lui-même. La
 * première adresse de la liste peut donc être inventée par un robot (une nouvelle à chaque
 * essai, pour échapper à la limite) : seule la DERNIÈRE est fiable.
 *
 * Sans répartiteur (développement, tests), Next.js remplit lui-même l'en-tête avec l'adresse de
 * la connexion, seulement s'il est absent.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || headers.get("x-real-ip") || "inconnue";
}
