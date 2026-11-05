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
