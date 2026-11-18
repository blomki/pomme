#!/bin/bash -l
# Lancé par Clever Cloud une fois par heure (clevercloud/cron.json). « bash -l » : charge les
# variables d'environnement de l'application, que les tâches planifiées ne reçoivent pas sinon.
#
# Seulement sur la première instance (numéro 0) : chaque instance lance toutes les tâches.
# Pendant un déploiement, ancienne et nouvelle instance peuvent la lancer toutes les deux : la
# clôture verrouille la période et ne s'exécute qu'une fois (src/server/order-periods.ts).
set -euo pipefail

if [ "${INSTANCE_NUMBER:-0}" = "0" ]; then
  cd "$APP_HOME"
  pnpm jobs:hourly
fi
