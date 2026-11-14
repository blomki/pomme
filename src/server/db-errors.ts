/** Code d'erreur PostgreSQL d'une contrainte d'unicité violée. */
const UNIQUE_VIOLATION = "23505";

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
