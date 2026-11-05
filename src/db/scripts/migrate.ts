// pnpm db:migrate — applique les migrations de src/db/migrations.
import { runMigrations } from "../migrate";

import { requireEnv, runScript } from "./env";

runScript(async () => {
  await runMigrations(requireEnv("DATABASE_MIGRATION_URL"));
  console.log("Migrations appliquées.");
});
