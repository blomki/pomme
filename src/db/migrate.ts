import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "./client";

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "src/db/migrations");

/**
 * Applique les migrations pas encore passées, dans l'ordre, avec le rôle propriétaire.
 * Drizzle note celles déjà appliquées dans la table drizzle.__drizzle_migrations.
 */
export async function runMigrations(ownerUrl: string): Promise<void> {
  const db = createDatabase(ownerUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end();
  }
}
