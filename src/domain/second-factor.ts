import type { AmapRoleName } from "./roles";

/**
 * Deuxième vérification (story A1).
 *
 * Un lien magique prouve seulement l'accès à la boîte email. Pour les comptes qui peuvent agir
 * sur toute une AMAP (admins) ou sur toute la plateforme (gestionnaires), on exige une deuxième
 * preuve : une passkey, ou un code d'une application d'authentification (TOTP), ou à défaut un
 * code de secours. Les familles, référents et producteurs n'y sont pas soumis.
 */

/** Rôles qui imposent la deuxième vérification. */
export const SECOND_FACTOR_ROLES: readonly AmapRoleName[] = ["admin"];

export type AccountAuthority = {
  /** Gestionnaire de la plateforme. */
  isPlatformAdmin: boolean;
  /** Rôles du compte, toutes AMAP confondues. */
  roles: readonly AmapRoleName[];
};

/**
 * Vrai si le compte doit faire une deuxième vérification.
 *
 * @example requiresSecondFactor({ isPlatformAdmin: false, roles: ["admin"] }) // true
 * @example requiresSecondFactor({ isPlatformAdmin: false, roles: ["referent"] }) // false
 */
export function requiresSecondFactor(account: AccountAuthority): boolean {
  return (
    account.isPlatformAdmin || account.roles.some((role) => SECOND_FACTOR_ROLES.includes(role))
  );
}

export type SecondFactorFacts = {
  /** Le compte est soumis à la deuxième vérification. */
  required: boolean;
  /** Date de la deuxième vérification sur cette session, ou null. */
  verifiedAt: Date | null;
  /** Le compte a au moins un moyen de vérification (passkey ou application). */
  hasFactor: boolean;
};

/**
 * Où en est la session :
 * - "not_required" : rien à faire (famille, référent…) ;
 * - "verified" : deuxième vérification faite sur cette session ;
 * - "challenge" : le compte a un moyen de vérification, il faut s'en servir ;
 * - "enroll" : le compte n'en a aucun, il faut en créer un (le premier compte comme vérifié).
 */
export type SecondFactorStatus = "not_required" | "verified" | "challenge" | "enroll";

export function secondFactorStatus(facts: SecondFactorFacts): SecondFactorStatus {
  if (!facts.required) return "not_required";
  if (facts.verifiedAt) return "verified";
  return facts.hasFactor ? "challenge" : "enroll";
}

/**
 * Vrai si la session peut ajouter ou retirer un moyen de vérification.
 *
 * Pourquoi : sans cette règle, quelqu'un qui aurait volé l'accès à la boîte email d'un admin
 * pourrait enregistrer SA passkey et contourner la deuxième vérification. Le tout premier moyen
 * reste possible après un simple lien magique (il n'y a rien d'autre à vérifier).
 */
export function canManageFactors(facts: SecondFactorFacts): boolean {
  const status = secondFactorStatus(facts);
  return status !== "challenge";
}

/**
 * Vrai si une action réservée à ces rôles exige la deuxième vérification : quand tous les
 * rôles qui donnent accès à l'action sont soumis à la deuxième vérification. Un admin qui est
 * aussi référent fait une action de référent sans deuxième vérification.
 *
 * @example actionNeedsSecondFactor(["admin"], ["admin"]) // true
 * @example actionNeedsSecondFactor(["admin", "referent"], ["admin", "referent"]) // false
 */
export function actionNeedsSecondFactor(
  userRoles: readonly AmapRoleName[],
  allowed: readonly AmapRoleName[],
): boolean {
  const granting = userRoles.filter((role) => allowed.includes(role));
  return granting.length > 0 && granting.every((role) => SECOND_FACTOR_ROLES.includes(role));
}

/**
 * Nettoie un code saisi : espaces et tirets retirés (les applications affichent « 123 456 »).
 * Renvoie null si ce n'est pas un code à 6 chiffres.
 */
export function normalizeTotpCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/**
 * Nettoie un code de secours saisi (« abcde-12345 », avec ou sans tiret). Les codes distinguent
 * majuscules et minuscules : on ne change pas la casse. Renvoie null si le format ne va pas.
 */
export function normalizeBackupCode(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "");
  return /^[A-Za-z0-9]{10}$/.test(compact) ? `${compact.slice(0, 5)}-${compact.slice(5)}` : null;
}
