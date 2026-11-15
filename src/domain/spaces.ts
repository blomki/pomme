/**
 * Espaces d'un compte : là où il peut aller après la connexion.
 * Un compte peut en avoir plusieurs (admin d'une AMAP, référent, membre d'un foyer, dans une
 * ou plusieurs AMAP). Seule la plateforme ne dépend d'aucune AMAP.
 */
export const AMAP_SPACES = ["admin", "referent", "famille"] as const;
export type AmapSpaceKind = (typeof AMAP_SPACES)[number];

export type AmapSpace = { amapSlug: string; amapName: string; kind: AmapSpaceKind };

/** Adresse d'un espace d'AMAP : /hommesdeterre/admin, /hommesdeterre/famille… */
export function spacePath(space: Pick<AmapSpace, "amapSlug" | "kind">): string {
  return `/${space.amapSlug}/${space.kind}`;
}

/**
 * Où envoyer quelqu'un qui vient de se connecter.
 *
 * - une seule AMAP : son espace le plus « responsable » (administration, puis référent, puis
 *   famille) ; les autres restent à un clic (sélecteur d'espace, « Mon compte ») ;
 * - gestionnaire de la plateforme sans autre espace : la plateforme ;
 * - plusieurs AMAP, ou plateforme et AMAP : « Mon compte », qui liste tous les espaces ;
 * - aucun espace (compte sans rôle ni foyer) : « Mon compte ».
 */
export function landingPath(spaces: readonly AmapSpace[], isPlatformAdmin: boolean): string {
  if (isPlatformAdmin) return spaces.length === 0 ? "/plateforme" : "/compte";
  const amaps = new Set(spaces.map((space) => space.amapSlug));
  const first = sortSpaces(spaces)[0];
  return amaps.size === 1 && first ? spacePath(first) : "/compte";
}

/** Tri pour l'affichage : par AMAP, puis administration, référent, famille. */
export function sortSpaces(spaces: readonly AmapSpace[]): AmapSpace[] {
  return [...spaces].sort(
    (a, b) =>
      a.amapName.localeCompare(b.amapName, "fr") ||
      AMAP_SPACES.indexOf(a.kind) - AMAP_SPACES.indexOf(b.kind),
  );
}
