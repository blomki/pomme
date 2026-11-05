import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import { createDatabase, type Database } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { setupAppRole } from "@/db/setup";

import { startPostgres } from "./postgres";

const APP_USER = "pomme_app";
const APP_PASSWORD = "test_app_password";

export type TestDatabase = {
  container: StartedPostgreSqlContainer;
  /** Connexion propriétaire : contourne la RLS. Sert à préparer les données des tests. */
  owner: Database;
  /** Connexion de l'application (pomme_app) : soumise à la RLS, comme en production. */
  app: Database;
  appUrl: string;
  stop: () => Promise<void>;
};

/**
 * PostgreSQL jetable, préparé comme une vraie base : rôle applicatif créé, migrations appliquées.
 */
export async function startDatabase(): Promise<TestDatabase> {
  const container = await startPostgres();
  const ownerUrl = container.getConnectionUri();
  await setupAppRole({ ownerUrl, appUser: APP_USER, appPassword: APP_PASSWORD });
  await runMigrations(ownerUrl);

  const url = new URL(ownerUrl);
  url.username = APP_USER;
  url.password = APP_PASSWORD;
  const appUrl = url.toString();

  const owner = createDatabase(ownerUrl);
  const app = createDatabase(appUrl);
  return {
    container,
    owner,
    app,
    appUrl,
    stop: async () => {
      await app.$client.end();
      await owner.$client.end();
      await container.stop();
    },
  };
}
