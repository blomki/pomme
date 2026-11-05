import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

/** Transaction Drizzle : à passer aux fonctions qui doivent écrire dans la même transaction. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Crée une connexion à la base (un « pool » de connexions réutilisées). */
export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString });
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
