/** Codes d'erreur PostgreSQL : contrainte d'unicité, clé étrangère, contrainte d'exclusion. */
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const EXCLUSION_VIOLATION = "23P01";
const INSUFFICIENT_PRIVILEGE = "42501";

type PgError = { code?: string; constraint?: string };

/** L'erreur PostgreSQL d'origine (Drizzle l'enveloppe dans sa propre erreur, en « cause »). */
function pgError(error: unknown): PgError {
  const cause = (error as { cause?: unknown })?.cause ?? error;
  return (cause ?? {}) as PgError;
}

/**
 * Nom de la contrainte d'unicité violée, ou null si ce n'est pas une violation d'unicité.
 * Permet de traduire une erreur de la base en message clair (« ce nom est déjà pris »).
 */
export function uniqueViolation(error: unknown): string | null {
  const pg = pgError(error);
  return pg.code === UNIQUE_VIOLATION ? (pg.constraint ?? "") : null;
}

/** Vrai si l'erreur vient d'une clé étrangère (la ligne référencée n'existe pas). */
export function foreignKeyViolation(error: unknown): boolean {
  return pgError(error).code === FOREIGN_KEY_VIOLATION;
}

/**
 * Nom de la contrainte d'exclusion violée (deux périodes qui se chevauchent, par exemple), ou
 * null si ce n'en est pas une.
 */
export function exclusionViolation(error: unknown): string | null {
  const pg = pgError(error);
  return pg.code === EXCLUSION_VIOLATION ? (pg.constraint ?? "") : null;
}

/** Vrai si une fonction de base a refusé l'appel (droit manquant, RAISE … insufficient_privilege). */
export function insufficientPrivilege(error: unknown): boolean {
  return pgError(error).code === INSUFFICIENT_PRIVILEGE;
}
