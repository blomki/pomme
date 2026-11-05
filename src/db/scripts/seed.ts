// pnpm db:seed — charge le jeu de données fictif (efface d'abord les données existantes).
import { createDatabase } from "../client";
import { assertSeedAllowed, seedDatabase } from "../seed";

import { requireEnv, runScript } from "./env";

runScript(async () => {
  const url = requireEnv("DATABASE_MIGRATION_URL");
  assertSeedAllowed(url, process.env);
  const db = createDatabase(url);
  try {
    const summary = await seedDatabase(db);
    console.log(
      `Jeu de données chargé : ${summary.amaps} AMAP, ${summary.users} utilisateurs, ` +
        `${summary.roles} rôles.`,
    );
  } finally {
    await db.$client.end();
  }
});
