#!/usr/bin/env bash
# Lancé par Clever Cloud avant chaque démarrage de l'application (CC_PRE_RUN_HOOK, voir
# docs/deploiement.md). Prépare les rôles PostgreSQL puis applique les migrations.
#
# Seulement sur la première instance (numéro 0) : avec plusieurs instances, elles lanceraient
# sinon les migrations en même temps. Si ce script échoue, Clever Cloud annule le déploiement et
# l'ancienne version continue de servir.
#
# Pendant le déploiement, l'ancienne version tourne encore sur la base déjà migrée : chaque
# migration doit rester compatible avec la version précédente (ajouter avant de supprimer).
set -euo pipefail

if [ "${INSTANCE_NUMBER:-0}" = "0" ]; then
  pnpm db:setup
  pnpm db:migrate
fi
