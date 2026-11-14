import { Client } from "pg";

import { poolConfig } from "./client";

/**
 * Prépare un rôle PostgreSQL de connexion restreint, une fois par base.
 *
 * Trois rôles, trois usages (voir ADR 0003 et 0005) :
 * - le propriétaire (pomme en local) crée les tables via les migrations ; PostgreSQL ne lui
 *   applique pas la Row Level Security de ses propres tables ;
 * - pomme_app, utilisé par l'application, et pomme_auth, utilisé par Better Auth, peuvent lire
 *   et écrire les tables que leurs politiques RLS leur ouvrent, mais n'en sont pas
 *   propriétaires : ils ne peuvent ni désactiver la RLS, ni la contourner (pas de BYPASSRLS,
 *   vérifié par assertRestricted), ni créer ou modifier des tables.
 *
 * Le propriétaire n'a pas besoin d'être super-utilisateur : le droit CREATEROLE suffit (c'est
 * le cas de l'utilisateur admin de Scaleway, ADR 0008).
 *
 * Idempotent : peut être relancé sans risque (par exemple pour changer le mot de passe).
 * À lancer AVANT les migrations : les politiques RLS citent pomme_auth.
 */
export async function setupRole(params: {
  ownerUrl: string;
  appUser: string;
  appPassword: string;
}): Promise<void> {
  const { appUser, appPassword } = params;
  if (!/^[a-z_][a-z0-9_]*$/.test(appUser)) throw new Error(`Nom de rôle invalide : ${appUser}`);

  const client = new Client(poolConfig(params.ownerUrl));
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
      `alter role ${role} with login nocreatedb nocreaterole
         password ${client.escapeLiteral(appPassword)}`,
    );
    await assertRestricted(client, appUser);
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

/**
 * Vérifie que le rôle n'a aucun pouvoir de contournement.
 *
 * On ne peut pas les retirer nous-mêmes : chez Scaleway (ADR 0008), le propriétaire n'est pas
 * super-utilisateur, et PostgreSQL lui interdit même d'ÉCRIRE « nosuperuser » ou « nobypassrls ».
 * Un rôle qu'il crée n'a de toute façon pas ces pouvoirs. Si quelqu'un les lui avait donnés
 * (à la main), on s'arrête plutôt que de démarrer avec une isolation entre AMAP percée.
 */
async function assertRestricted(client: Client, appUser: string): Promise<void> {
  const { rows } = await client.query<Record<string, boolean>>(
    `select rolsuper, rolbypassrls, rolreplication, rolcreaterole, rolcreatedb
       from pg_roles where rolname = $1`,
    [appUser],
  );
  const powers = Object.entries(rows[0] ?? {}).filter(([, granted]) => granted);
  if (powers.length > 0) {
    throw new Error(
      `Le rôle ${appUser} a des droits qu'il ne doit pas avoir (${powers.map(([p]) => p).join(", ")}) : ` +
        "les retirer avec un super-utilisateur.",
    );
  }
}

/** Lit le nom et le mot de passe d'un rôle dans son adresse de connexion. */
export function parseAppCredentials(databaseUrl: string): { appUser: string; appPassword: string } {
  const url = new URL(databaseUrl);
  const appUser = decodeURIComponent(url.username);
  const appPassword = decodeURIComponent(url.password);
  if (!appUser || !appPassword) {
    throw new Error("L'adresse de connexion doit contenir un utilisateur et un mot de passe.");
  }
  return { appUser, appPassword };
}
