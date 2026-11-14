import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

/** Même version majeure qu'en production (PostgreSQL géré de Clever Cloud, ADR 0008). */
export const POSTGRES_IMAGE = "postgres:17-alpine";

/**
 * Démarre un PostgreSQL jetable dans Docker pour un fichier de tests.
 * Docker doit tourner (Docker Desktop avec l'intégration WSL, ou Docker dans WSL).
 * Le conteneur est supprimé à la fin : aucune donnée ne reste.
 */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(POSTGRES_IMAGE).start();
}
