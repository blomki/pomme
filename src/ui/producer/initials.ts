// Petits mots ignorés pour les initiales d'une AMAP (« AMAP de Hommes de Terre » → « HT »).
const SKIPPED = new Set(["amap", "de", "des", "du", "la", "le", "les", "et", "en", "au", "aux"]);

/**
 * Initiales d'une AMAP, affichées à la place de son logo tant qu'elle n'en a pas : les deux
 * premiers mots qui comptent, sans les articles ni le mot « AMAP ».
 *
 * @example amapInitials("Hommes de Terre") // "HT"
 */
export function amapInitials(name: string): string {
  const words = name
    .split(/[\s'’-]+/)
    .filter((w) => w !== "" && !SKIPPED.has(w.toLowerCase()) && /\p{L}/u.test(w[0]!));
  const letters = (words.length > 0 ? words : [name]).slice(0, 2).map((w) => w[0]!);
  return letters.join("").toUpperCase();
}
