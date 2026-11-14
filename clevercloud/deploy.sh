#!/usr/bin/env bash
# Déploie le commit courant sur une application Clever Cloud (voir docs/deploiement.md).
# Usage : bash clevercloud/deploy.sh <app_id>
# Lancé par les workflows de déploiement, avec CLEVER_TOKEN et CLEVER_SECRET (compte de la CI).
#
# Clever Cloud reçoit le code par un « git push », construit l'application, lance
# clevercloud/pre-run.sh (rôles et migrations), vérifie /api/health, puis bascule. La commande
# suit les journaux et échoue si le déploiement échoue : l'ancienne version reste alors en ligne.
set -euo pipefail

APP_ID="$1"
ORG_ID="orga_1524590b-6edb-4a4d-9bfb-c7f021ab4738"
# Version figée, comme toutes nos dépendances.
CLEVER="npx --yes clever-tools@5.3.0"

# Les workflows récupèrent un commit précis, hors de toute branche : on en fait une branche
# locale, que Clever Cloud sait recevoir.
git switch --force-create deploiement

$CLEVER link "$APP_ID" --org "$ORG_ID"
# --force : la production peut recevoir un commit plus ancien que celui déjà en ligne (retour
# en arrière). Même commit déjà en ligne : rien à faire.
$CLEVER deploy --branch deploiement --force --same-commit-policy ignore
