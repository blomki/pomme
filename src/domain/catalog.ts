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

// --- Publication et lecture seule (story C3) -------------------------------------------------

/**
 * Le catalogue d'un mois n'est plus modifiable : mois passé (« Les catalogues passés sont en
 * lecture seule »), ou commandes de ce mois clôturées. Une réouverture des commandes le rend de
 * nouveau modifiable.
 *
 * @param currentMonth mois en cours, à Paris (« 2026-11 »)
 */
export function isCatalogReadOnly(params: {
  month: string;
  currentMonth: string;
  ordersClosed: boolean;
}): boolean {
  return params.month < params.currentMonth || params.ordersClosed;
}

export type PublishProblem = { kind: "empty" } | { kind: "no_week"; names: string[] };

/**
 * Ce qui empêche de publier un catalogue : aucun produit proposé, ou un produit proposé
 * disponible à aucune semaine (il faut cocher ses semaines, ou le retirer). Null : publiable.
 */
export function publishProblem(
  lines: ReadonlyArray<{ name: string; removed: boolean; available: readonly string[] }>,
): PublishProblem | null {
  const offered = lines.filter((l) => !l.removed);
  if (offered.length === 0) return { kind: "empty" };
  const withoutWeek = offered.filter((l) => l.available.length === 0).map((l) => l.name);
  return withoutWeek.length > 0 ? { kind: "no_week", names: withoutWeek } : null;
}

/** Délai avant l'ouverture des commandes au-delà duquel un catalogue non publié bloque. */
export const PUBLISH_DEADLINE_DAYS = 3;

/**
 * Jour à partir duquel un catalogue non publié devient une tâche « Bloquant » : trois jours
 * avant l'ouverture des commandes (jours au format « AAAA-MM-JJ », sans fuseau).
 *
 * @example publishDeadline("2026-11-15") // "2026-11-12"
 */
export function publishDeadline(opensOn: string): string {
  const date = new Date(`${opensOn}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - PUBLISH_DEADLINE_DAYS);
  return date.toISOString().slice(0, 10);
}
