/**
 * Espaces d'un compte : là où il peut aller après la connexion.
 * Un compte peut en avoir plusieurs (admin d'une AMAP, référent, membre d'un foyer, dans une
 * ou plusieurs AMAP). L'espace producteur et la plateforme ne dépendent d'aucune AMAP.
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
 * - gestionnaire de la plateforme, ou producteur, sans autre espace : la plateforme, ou
 *   l'espace producteur ;
 * - plusieurs AMAP, ou plateforme / producteur et AMAP : « Mon compte », qui liste tout ;
 * - aucun espace (compte sans rôle ni foyer) : « Mon compte ».
 */
export function landingPath(
  spaces: readonly AmapSpace[],
  other: { isPlatformAdmin: boolean; isProducer: boolean },
): string {
  const global = [
    ...(other.isPlatformAdmin ? ["/plateforme"] : []),
    ...(other.isProducer ? ["/producteur"] : []),
  ];
  const [onlyGlobal] = global;
  if (global.length > 0) {
    return spaces.length === 0 && global.length === 1 && onlyGlobal ? onlyGlobal : "/compte";
  }
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
