// pnpm db:setup — crée ou met à jour le rôle applicatif pomme_app (une fois par base).
import { parseAppCredentials, setupAppRole } from "../setup";

import { requireEnv, runScript } from "./env";

runScript(async () => {
  const { appUser, appPassword } = parseAppCredentials(requireEnv("DATABASE_URL"));
  await setupAppRole({ ownerUrl: requireEnv("DATABASE_MIGRATION_URL"), appUser, appPassword });
  console.log(`Rôle ${appUser} prêt.`);
});
