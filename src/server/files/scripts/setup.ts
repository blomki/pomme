// pnpm files:setup — prépare le bucket des fichiers déposés (fiche S11) : création, lecture
// publique. En local : le service « files » de docker-compose.yml. Chez Clever Cloud : à lancer
// une fois par environnement, avec les variables de l'add-on Cellar (voir docs/deploiement.md).
import { runScript } from "../../../db/scripts/env";
import { storageSettings } from "../settings";
import { setupBucket } from "../setup-bucket";

runScript(async () => {
  const settings = storageSettings();
  if (!settings) {
    throw new Error(
      "Stockage des fichiers non configuré : FILES_BUCKET et les identifiants manquent (voir .env.example).",
    );
  }
  for (const line of await setupBucket(settings)) console.log(line);
});
