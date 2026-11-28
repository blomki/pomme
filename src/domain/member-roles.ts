import { canRevokeAdmin } from "./households";

/**
 * Rôles d'un membre, enregistrés depuis la fenêtre « Rôles de … » de la fiche d'un foyer
 * (fiche #138) : une case « Administrateur » et une case « Référent : <producteur> » par
 * producteur actif de l'AMAP.
 *
 * Le rôle de référent n'est plus une case à part : il se déduit des producteurs suivis. Cocher
 * un producteur rend la personne référente ; décocher son dernier producteur retire le rôle.
 * Ainsi, le rôle et les affectations ne peuvent plus se contredire.
 */

export type MemberRolesInput = {
  /** La personne est administratrice aujourd'hui. */
  isAdmin: boolean;
  /** Case « Administrateur » cochée. */
  wantsAdmin: boolean;
  /** Nombre d'administrateurs de l'AMAP aujourd'hui, la personne comprise. */
  adminCount: number;
  /** La personne a le rôle de référent aujourd'hui. */
  isReferent: boolean;
  /** Producteurs (actifs, ceux de la fenêtre) qu'elle suit aujourd'hui. */
  followed: readonly string[];
  /** Producteurs cochés dans la fenêtre. */
  wanted: readonly string[];
  /** Producteurs inactifs qu'elle suit encore (absents de la fenêtre, gardés tels quels). */
  followedElsewhere: number;
};

type Change = "grant" | "revoke" | "keep";

export type MemberRolesPlan =
  | { status: "ok"; admin: Change; referent: Change; assign: string[]; unassign: string[] }
  | { status: "last_admin" };

/**
 * Ce qu'il faut changer pour passer de l'état actuel aux cases cochées.
 *
 * @example planMemberRoles({ isAdmin: false, wantsAdmin: false, adminCount: 2, isReferent: false,
 *   followed: [], wanted: ["ruches"], followedElsewhere: 0 })
 *   // { status: "ok", admin: "keep", referent: "grant", assign: ["ruches"], unassign: [] }
 */
export function planMemberRoles(input: MemberRolesInput): MemberRolesPlan {
  if (input.isAdmin && !input.wantsAdmin && !canRevokeAdmin(input.adminCount)) {
    return { status: "last_admin" };
  }
  const wanted = new Set(input.wanted);
  const followed = new Set(input.followed);
  const assign = [...wanted].filter((id) => !followed.has(id));
  const unassign = [...followed].filter((id) => !wanted.has(id));
  const staysReferent = wanted.size + input.followedElsewhere > 0;
  return {
    status: "ok",
    admin: change(input.isAdmin, input.wantsAdmin),
    referent: change(input.isReferent, staysReferent),
    assign,
    unassign,
  };
}

function change(before: boolean, after: boolean): Change {
  if (before === after) return "keep";
  return after ? "grant" : "revoke";
}

/**
 * Producteurs qui n'auraient plus aucun référent si l'on décoche ces cases : la fenêtre
 * l'annonce avant l'enregistrement (« … n'aura plus de référent »). Permis : la tâche
 * « Bloquant » du tableau de bord prend le relais.
 *
 * @param referentCount nombre de référents actuels de chaque producteur, la personne comprise
 */
export function producersLeftWithoutReferent(
  unassigned: readonly string[],
  referentCount: ReadonlyMap<string, number>,
): string[] {
  return unassigned.filter((id) => (referentCount.get(id) ?? 0) <= 1);
}
