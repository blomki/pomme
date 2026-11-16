/**
 * Catalogue du mois (story C2) : fiches produit communes au producteur, prix et disponibilités
 * propres à chaque AMAP et à chaque mois. Les montants sont toujours des centimes entiers.
 */

/**
 * Prix saisi en euros (« 4,00 », « 4.5 », « 4 », « 12,50 € ») converti en centimes. Renvoie null
 * si la saisie n'est pas un prix valable : vide, négatif ou nul, plus de deux décimales, ou
 * au-delà de 10 000 €.
 *
 * @example parsePriceCents("4,00") // 400
 * @example parsePriceCents("7.5") // 750
 */
export function parsePriceCents(input: string): number | null {
  const text = input.replace(/\s|€/g, "").replace(",", ".");
  const [whole = "", decimals = "", ...rest] = text.split(".");
  if (rest.length > 0 || !/^\d{1,5}$/.test(whole) || !/^\d{0,2}$/.test(decimals)) return null;
  if (text.endsWith(".")) return null;
  // Calcul sur les chiffres, jamais en nombre à virgule : 0,1 + 0,2 n'existe pas ici.
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return cents > 0 && cents <= 1_000_000 ? cents : null;
}

/** Prix en centimes affiché en euros, à la française : formatEuros(750) → « 7,50 € ». */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** Prix en centimes pour un champ de saisie : priceInput(750) → « 7,50 ». */
export function priceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Nom de produit tel qu'il est enregistré (conditionnement compris : « Œufs, boîte de 6 ») :
 * espaces en trop retirés.
 */
export function normalizeProductName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Deux noms désignent le même produit, sans tenir compte des majuscules ni des espaces. */
export function sameProductName(a: string, b: string): boolean {
  return (
    normalizeProductName(a).toLocaleLowerCase("fr") ===
    normalizeProductName(b).toLocaleLowerCase("fr")
  );
}

export type DraftLine = { name: string; removed: boolean };

/**
 * Noms en double parmi les produits proposés (non retirés) d'un brouillon : un catalogue ne
 * propose pas deux fois le même produit.
 */
export function duplicateNames(lines: readonly DraftLine[]): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const line of lines) {
    if (line.removed) continue;
    const key = normalizeProductName(line.name).toLocaleLowerCase("fr");
    if (seen.has(key)) duplicates.add(seen.get(key)!);
    else seen.set(key, normalizeProductName(line.name));
  }
  return [...duplicates];
}
