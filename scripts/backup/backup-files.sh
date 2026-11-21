#!/usr/bin/env bash
# Copie nocturne des fichiers déposés (photos, logos, images des pages : stockage Cellar de
# Clever Cloud) vers Scaleway (fiche S8, ADR 0036). Lancé par .github/workflows/sauvegardes.yml.
#
# Les deux stockages ont chacun leurs clés : la copie passe par un dossier temporaire
# (quelques centaines de Mo au plus). Côté Scaleway, le compartiment garde les versions : un
# fichier remplacé ou supprimé chez Cellar reste récupérable 30 jours (règle de cycle de vie,
# docs/reprise.md).
#
# Variables attendues :
#   SOURCE_ENDPOINT, SOURCE_BUCKET, SOURCE_ACCESS_KEY_ID, SOURCE_SECRET_ACCESS_KEY   (Cellar)
#   S3_ENDPOINT, S3_REGION, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY      (Scaleway)
set -euo pipefail

# Le client AWS récent ajoute par défaut des sommes de contrôle que les stockages compatibles S3
# (Scaleway, Cellar, SeaweedFS en local) n'acceptent pas toujours : seulement si nécessaire.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

: "${SOURCE_ENDPOINT:?}" "${SOURCE_BUCKET:?}" "${SOURCE_ACCESS_KEY_ID:?}" "${SOURCE_SECRET_ACCESS_KEY:?}"
: "${S3_ENDPOINT:?}" "${S3_REGION:?}" "${S3_BUCKET:?}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# 1. Cellar → dossier temporaire, avec les clés de Cellar.
AWS_ACCESS_KEY_ID="$SOURCE_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$SOURCE_SECRET_ACCESS_KEY" \
  aws --endpoint-url "$SOURCE_ENDPOINT" --region us-east-1 \
  s3 sync "s3://$SOURCE_BUCKET" "$work/files" --only-show-errors

count=$(find "$work/files" -type f | wc -l)

# 2. Dossier → Scaleway, sous files/. --delete : un fichier disparu chez Cellar devient une
# ancienne version chez Scaleway (gardée 30 jours), il n'est pas perdu tout de suite.
aws --endpoint-url "$S3_ENDPOINT" --region "$S3_REGION" \
  s3 sync "$work/files" "s3://$S3_BUCKET/files" --delete --only-show-errors

echo "Fichiers copiés : $count"
