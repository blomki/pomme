import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import { createDatabase, type Database } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { setupRole } from "@/db/setup";

import { startPostgres } from "./postgres";

const APP_USER = "pomme_app";
const APP_PASSWORD = "test_app_password";
const AUTH_USER = "pomme_auth";
const AUTH_PASSWORD = "test_auth_password";

export type TestDatabase = {
  container: StartedPostgreSqlContainer;
  /** Connexion propriétaire : contourne la RLS. Sert à préparer les données des tests. */
  owner: Database;
  /** Connexion de l'application (pomme_app) : soumise à la RLS, comme en production. */
  app: Database;
  appUrl: string;
  /** Connexion de Better Auth (pomme_auth) : seule à lire les tables de connexion. */
  auth: Database;
  stop: () => Promise<void>;
};

/**
 * PostgreSQL jetable, préparé comme une vraie base : rôle applicatif créé, migrations appliquées.
 */
export async function startDatabase(): Promise<TestDatabase> {
  const container = await startPostgres();
  const ownerUrl = container.getConnectionUri();
  await setupRole({ ownerUrl, appUser: APP_USER, appPassword: APP_PASSWORD });
  await setupRole({ ownerUrl, appUser: AUTH_USER, appPassword: AUTH_PASSWORD });
  await runMigrations(ownerUrl);

  const urlFor = (user: string, password: string) => {
    const url = new URL(ownerUrl);
    url.username = user;
    url.password = password;
    return url.toString();
  };
  const appUrl = urlFor(APP_USER, APP_PASSWORD);

  const owner = createDatabase(ownerUrl);
  const app = createDatabase(appUrl);
  const auth = createDatabase(urlFor(AUTH_USER, AUTH_PASSWORD));
  return {
    container,
    owner,
    app,
    appUrl,
    auth,
    stop: async () => {
      await auth.$client.end();
      await app.$client.end();
      await owner.$client.end();
      await container.stop();
    },
  };
}
