/**
 * Foyers et membres (story A2).
 *
 * Le foyer est l'unité qui commande et paie. Il a un ou plusieurs membres, chacun avec son
 * propre compte (connexion par lien magique), et un seul contact principal : celui qu'on
 * appelle en cas de question sur une commande ou un chèque.
 */

/**
 * Nom d'un foyer tel qu'il est enregistré : espaces en trop retirés.
 *
 * @example normalizeHouseholdName("  Foyer   Martin ") // "Foyer Martin"
 */
export function normalizeHouseholdName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Statut d'un membre, affiché à l'admin :
 * - « invited » (invité) : la personne ne s'est encore jamais connectée ;
 * - « active » (actif) : elle s'est connectée au moins une fois (son adresse email est vérifiée
 *   par le lien de connexion qu'elle a ouvert).
 */
export type MemberStatus = "invited" | "active";

export function memberStatus(member: { emailVerified: boolean }): MemberStatus {
  return member.emailVerified ? "active" : "invited";
}

export type NewMember = { email: string; isPrimary: boolean };

export type MembersProblem = "no_member" | "duplicate_email" | "primary_count";

/**
 * Vérifie la liste des membres d'un nouveau foyer : au moins un membre, pas deux fois la même
 * adresse, exactement un contact principal.
 *
 * @example checkNewMembers([{ email: "a@x.org", isPrimary: true }]) // null (rien à redire)
 */
export function checkNewMembers(members: readonly NewMember[]): MembersProblem | null {
  if (members.length === 0) return "no_member";
  const emails = new Set(members.map((member) => member.email.toLowerCase()));
  if (emails.size !== members.length) return "duplicate_email";
  if (members.filter((member) => member.isPrimary).length !== 1) return "primary_count";
  return null;
}

/**
 * Peut-on retirer le rôle d'administrateur à cette personne ? Non s'il ne resterait aucun
 * administrateur : plus personne ne pourrait gérer l'AMAP (ni rendre le rôle).
 *
 * @param adminCount nombre actuel d'administrateurs de l'AMAP, la personne comprise
 */
export function canRevokeAdmin(adminCount: number): boolean {
  return adminCount > 1;
}

/**
 * L'anonymisation est irréversible : l'administrateur confirme en retapant le nom du foyer.
 * Les espaces en trop et les majuscules ne comptent pas.
 *
 * @example confirmsAnonymization(" foyer martin", "Foyer Martin") // true
 */
export function confirmsAnonymization(typed: string, householdName: string): boolean {
  const simplify = (text: string) => normalizeHouseholdName(text).toLocaleLowerCase("fr");
  return typed.trim() !== "" && simplify(typed) === simplify(householdName);
}
