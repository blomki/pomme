import { Client } from "pg";

/**
 * Prépare le rôle PostgreSQL de l'application (pomme_app), une fois par base.
 *
 * Deux rôles, deux usages (voir ADR 0003) :
 * - le propriétaire (pomme en local) crée les tables via les migrations ; PostgreSQL ne lui
 *   applique pas la Row Level Security de ses propres tables ;
 * - pomme_app, utilisé par l'application, peut lire et écrire les tables mais n'en est pas
 *   propriétaire : il ne peut ni désactiver la RLS, ni la contourner (NOBYPASSRLS), ni créer
 *   ou modifier des tables.
 *
 * Idempotent : peut être relancé sans risque (par exemple pour changer le mot de passe).
 */
export async function setupAppRole(params: {
  ownerUrl: string;
  appUser: string;
  appPassword: string;
}): Promise<void> {
  const { appUser, appPassword } = params;
  if (!/^[a-z_][a-z0-9_]*$/.test(appUser)) throw new Error(`Nom de rôle invalide : ${appUser}`);

  const client = new Client({ connectionString: params.ownerUrl });
  await client.connect();
  try {
    const role = client.escapeIdentifier(appUser);
    const { rows } = await client.query<{ db: string }>("select current_database() as db");
    const database = client.escapeIdentifier(rows[0]?.db ?? "");
    const exists = await client.query("select 1 from pg_roles where rolname = $1", [appUser]);

    // Les ordres de définition (CREATE ROLE, GRANT…) n'acceptent pas de paramètres $1 :
    // le nom et le mot de passe sont protégés par escapeIdentifier et escapeLiteral.
    if (exists.rowCount === 0) await client.query(`create role ${role}`);
    await client.query(
      `alter role ${role} with login nosuperuser nocreatedb nocreaterole noreplication
         nobypassrls password ${client.escapeLiteral(appPassword)}`,
    );
    await client.query(`grant connect on database ${database} to ${role}`);
    await client.query(`grant usage on schema public to ${role}`);
    await client.query(
      `grant select, insert, update, delete on all tables in schema public to ${role}`,
    );
    // Tables créées plus tard par les migrations (lancées par ce même propriétaire) :
    // mêmes droits, automatiquement.
    await client.query(
      `alter default privileges in schema public
         grant select, insert, update, delete on tables to ${role}`,
    );
  } finally {
    await client.end();
  }
}

/** Lit le nom et le mot de passe du rôle applicatif dans son adresse de connexion. */
export function parseAppCredentials(databaseUrl: string): { appUser: string; appPassword: string } {
  const url = new URL(databaseUrl);
  const appUser = decodeURIComponent(url.username);
  const appPassword = decodeURIComponent(url.password);
  if (!appUser || !appPassword) {
    throw new Error("DATABASE_URL doit contenir un utilisateur et un mot de passe.");
  }
  return { appUser, appPassword };
}
