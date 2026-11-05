/**
 * Adresse courte (slug) d'une AMAP : la partie de l'URL après le domaine,
 * par exemple « hommesdeterre » dans [domaine]/hommesdeterre.
 *
 * Utilisé à la création d'une AMAP (story J1) et dans ses réglages (story A4).
 */

/**
 * Mots déjà utilisés par des pages de la plateforme au même niveau que les AMAP
 * (voir ADR 0001). Une AMAP qui s'appellerait « producteur » masquerait l'espace producteur.
 */
export const RESERVED_AMAP_SLUGS: readonly string[] = ["producteur", "plateforme", "api"];

export const AMAP_SLUG_MIN_LENGTH = 3;
export const AMAP_SLUG_MAX_LENGTH = 40;

export type AmapSlugError =
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "misplaced_hyphen"
  | "reserved";

/**
 * Vérifie une adresse d'AMAP. Renvoie null si elle est valable, sinon la raison du refus
 * (l'interface traduit ce code en message français).
 *
 * Règles : 3 à 40 caractères ; minuscules sans accent, chiffres et tirets ; pas de tiret
 * au début, à la fin ni doublé ; pas de mot réservé.
 */
export function validateAmapSlug(slug: string): AmapSlugError | null {
  if (slug.length < AMAP_SLUG_MIN_LENGTH) return "too_short";
  if (slug.length > AMAP_SLUG_MAX_LENGTH) return "too_long";
  if (!/^[a-z0-9-]+$/.test(slug)) return "invalid_characters";
  if (slug.startsWith("-") || slug.endsWith("-") || slug.includes("--")) {
    return "misplaced_hyphen";
  }
  if (RESERVED_AMAP_SLUGS.includes(slug)) return "reserved";
  return null;
}

/**
 * Propose une adresse à partir du nom de l'AMAP, à corriger ensuite si besoin.
 *
 * @example suggestAmapSlug("Les Hommes de Terre") // « les-hommes-de-terre »
 * @example suggestAmapSlug("AMAP d'Éterville") // « amap-d-eterville »
 */
export function suggestAmapSlug(name: string): string {
  return (
    name
      // Sépare chaque lettre de son accent (« é » → « e » + accent), puis retire les accents.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // Tout ce qui n'est ni lettre ni chiffre devient un tiret (espaces, apostrophes…).
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, AMAP_SLUG_MAX_LENGTH)
      .replace(/^-+|-+$/g, "")
  );
}
