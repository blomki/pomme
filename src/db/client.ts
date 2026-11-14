import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

/** Transaction Drizzle : à passer aux fonctions qui doivent écrire dans la même transaction. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Réglages de connexion. Si l'hébergeur fournit le certificat de sa base (DATABASE_CA_CERT,
 * au format PEM), la connexion est chiffrée (TLS) ET le certificat du serveur est vérifié
 * (ADR 0008). Sans cette vérification, un intermédiaire pourrait se faire passer pour la base
 * et lire les mots de passe.
 *
 * Ne pas mettre de « sslmode » dans les adresses de connexion : il remplacerait ces réglages.
 */
export function poolConfig(
  connectionString: string,
  env: Record<string, string | undefined> = process.env,
): PoolConfig {
  const ca = env.DATABASE_CA_CERT;
  return ca ? { connectionString, ssl: { ca, rejectUnauthorized: true } } : { connectionString };
}

/** Crée une connexion à la base (un « pool » de connexions réutilisées). */
export function createDatabase(connectionString: string): Database {
  const pool = new Pool(poolConfig(connectionString));
  return drizzle(pool, { schema });
}

let appDatabase: Database | undefined;

/**
 * Connexion de l'application, avec le rôle restreint pomme_app (soumis à la RLS).
 * Créée au premier appel seulement, pour que « pnpm build » n'ait pas besoin de base.
 */
export function getDatabase(): Database {
  if (!appDatabase) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL n'est pas défini (voir .env.example).");
    appDatabase = createDatabase(url);
  }
  return appDatabase;
}
