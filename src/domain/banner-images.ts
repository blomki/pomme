/**
 * Images des bandeaux d'en-tête (charte du 2026-11-26, story S14, section 8). Chaque AMAP peut
 * donner une image (personnage, illustration, simple icône) par famille d'écrans des espaces
 * admin et référent. Sans image pour une famille, le bandeau montre le logo de l'AMAP.
 *
 * Des familles plutôt qu'une image par écran : six images suffisent à varier l'interface, et
 * une petite AMAP n'aura pas à en préparer vingt-six.
 */
export const BANNER_GROUPS = [
  "dashboard", // tableaux de bord, réglages
  "households", // foyers et adhésions
  "producers", // producteurs, catalogues, bons de commande
  "planning", // distributions, permanences
  "money", // chèques, avoirs, signalements
  "communication", // emails, pages du site
] as const;

export type BannerGroup = (typeof BANNER_GROUPS)[number];

/** Images enregistrées pour une AMAP : adresse publique par famille (colonne amap.banner_images). */
export type BannerImages = Partial<Record<BannerGroup, string>>;

export function isBannerGroup(value: unknown): value is BannerGroup {
  return typeof value === "string" && (BANNER_GROUPS as readonly string[]).includes(value);
}

/** Premier segment après l'espace (« foyers » dans /hommesdeterre/admin/foyers/12) → famille. */
const SECTION_GROUPS: Record<string, BannerGroup> = {
  foyers: "households",
  producteurs: "producers",
  catalogue: "producers",
  "bons-de-commande": "producers",
  planning: "planning",
  cheques: "money",
  avoirs: "money",
  signalements: "money",
  emails: "communication",
  pages: "communication",
};

/**
 * Famille d'écrans d'une adresse des espaces admin ou référent, ou null hors de ces espaces.
 * L'accueil de l'espace, les réglages, la reprise des données et tout écran non listé
 * reviennent au tableau de bord.
 */
export function bannerGroupFor(pathname: string): BannerGroup | null {
  // « /hommesdeterre/admin/foyers/12?x » → ["", "hommesdeterre", "admin", "foyers", "12"]
  const [, amap, space, section] = pathname.split(/[?#]/)[0]!.split("/");
  if (!amap || (space !== "admin" && space !== "referent")) return null;
  // Object.hasOwn : « constructor » ou « toString » ne sont pas des familles.
  return section && Object.hasOwn(SECTION_GROUPS, section) ? SECTION_GROUPS[section]! : "dashboard";
}

/** Image du bandeau pour cette adresse : celle de sa famille, sinon le logo, sinon aucune. */
export function bannerImageFor(
  pathname: string,
  images: BannerImages,
  logoUrl: string | null,
): string | null {
  const group = bannerGroupFor(pathname);
  return (group && images[group]) || logoUrl;
}
