/**
 * Rôles attribués dans une AMAP (table amap_role).
 *
 * « amapien » n'est pas un rôle stocké : il découle de l'appartenance à un foyer de l'AMAP.
 * « producteur » découle du lien entre un compte et un producteur. Les deux arriveront avec
 * leurs stories ; seuls les rôles attribués par un administrateur sont listés ici.
 */
export const AMAP_ROLES = ["admin", "referent"] as const;

export type AmapRoleName = (typeof AMAP_ROLES)[number];

/**
 * Vrai si l'utilisateur a au moins un des rôles demandés.
 *
 * @example hasAnyRole(["referent"], ["admin", "referent"]) // true
 * @example hasAnyRole([], ["admin"]) // false
 */
export function hasAnyRole(
  userRoles: readonly AmapRoleName[],
  allowed: readonly AmapRoleName[],
): boolean {
  return allowed.some((role) => userRoles.includes(role));
}

/**
 * Accès réservé au référent d'un producteur ou à un admin de l'AMAP : corriger une commande
 * (D7), changer la photo du producteur (S11). Le référent qui suit ce producteur passe ; un admin
 * passe chez tous les producteurs, mais avec la deuxième vérification (story A1) quand son rôle
 * d'admin est la seule raison d'y avoir accès. Familles et producteurs : refusés.
 *
 * @example referentOrAdminAccess({ roles: ["referent"], followsProducer: true, secondFactorVerified: false }) // "allowed"
 * @example referentOrAdminAccess({ roles: ["referent"], followsProducer: false, secondFactorVerified: true }) // "forbidden"
 */
export function referentOrAdminAccess(input: {
  roles: readonly AmapRoleName[];
  followsProducer: boolean;
  secondFactorVerified: boolean;
}): "allowed" | "forbidden" | "second_factor" {
  if (input.roles.includes("referent") && input.followsProducer) return "allowed";
  if (!input.roles.includes("admin")) return "forbidden";
  return input.secondFactorVerified ? "allowed" : "second_factor";
}
