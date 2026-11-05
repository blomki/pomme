// pnpm db:setup — crée ou met à jour les rôles pomme_app (application) et pomme_auth
// (Better Auth), une fois par base, avant les migrations.
import { parseAppCredentials, setupRole } from "../setup";

import { requireEnv, runScript } from "./env";

runScript(async () => {
  const ownerUrl = requireEnv("DATABASE_MIGRATION_URL");
  for (const variable of ["DATABASE_URL", "DATABASE_AUTH_URL"]) {
    const { appUser, appPassword } = parseAppCredentials(requireEnv(variable));
    await setupRole({ ownerUrl, appUser, appPassword });
    console.log(`Rôle ${appUser} prêt.`);
  }
});
