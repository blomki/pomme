#!/usr/bin/env bash
# Test de restauration (fiche S8, ADR 0036) : récupère la dernière sauvegarde quotidienne,
# la déchiffre, la restaure dans une base jetable et vérifie quelques comptages. Lancé chaque
# mois par .github/workflows/sauvegardes.yml. « Une sauvegarde non testée n'est pas une
# sauvegarde. »
#
# Variables attendues :
#   RESTORE_DATABASE_URL   base vide et jetable (jamais la production !)
#   AGE_IDENTITY           clé privée age du test de restauration (pas la clé hors ligne)
#   S3_ENDPOINT, S3_REGION, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   MAX_AGE_HOURS          âge maximal de la dernière sauvegarde (36 heures par défaut)
set -euo pipefail

# Le client AWS récent ajoute par défaut des sommes de contrôle que les stockages compatibles S3
# (Scaleway, Cellar, SeaweedFS en local) n'acceptent pas toujours : seulement si nécessaire.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

: "${RESTORE_DATABASE_URL:?}" "${AGE_IDENTITY:?}" "${S3_ENDPOINT:?}" "${S3_REGION:?}" "${S3_BUCKET:?}"
max_age="${MAX_AGE_HOURS:-36}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

s3() { aws --endpoint-url "$S3_ENDPOINT" --region "$S3_REGION" "$@"; }

# Dernière sauvegarde quotidienne (la plus récente d'après sa date d'envoi).
read -r key modified < <(s3 s3api list-objects-v2 --bucket "$S3_BUCKET" --prefix daily/ \
  --query 'sort_by(Contents, &LastModified)[-1].[Key, LastModified]' --output text)
if [ -z "${key:-}" ] || [ "$key" = "None" ]; then
  echo "Aucune sauvegarde quotidienne trouvée." >&2
  exit 1
fi
age_hours=$(( ($(date -u +%s) - $(date -u -d "$modified" +%s)) / 3600 ))
echo "Dernière sauvegarde : $key, il y a $age_hours h"
if [ "$age_hours" -gt "$max_age" ]; then
  echo "La dernière sauvegarde a plus de $max_age heures : la tâche nocturne ne tourne plus ?" >&2
  exit 1
fi

s3 s3api get-object --bucket "$S3_BUCKET" --key "$key" "$work/backup.dump.age" >/dev/null
printf '%s\n' "$AGE_IDENTITY" > "$work/identity.txt"
age --decrypt --identity "$work/identity.txt" --output "$work/backup.dump" "$work/backup.dump.age"
rm "$work/identity.txt"

# Restauration complète dans la base jetable ; une erreur arrête tout (--exit-on-error).
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_DATABASE_URL" "$work/backup.dump"

# Comptages : une base de production a au moins une AMAP, des foyers et des comptes.
psql "$RESTORE_DATABASE_URL" --no-psqlrc --tuples-only --no-align --field-separator ' ' \
  --command "select (select count(*) from amap), (select count(*) from household),
             (select count(*) from \"user\"), (select count(*) from \"order\")" > "$work/counts"
read -r amaps households users orders < "$work/counts"
echo "Restaurée : $amaps AMAP, $households foyers, $users comptes, $orders commandes"
if [ "$amaps" -lt 1 ] || [ "$households" -lt 1 ] || [ "$users" -lt 1 ]; then
  echo "Comptages anormaux : la sauvegarde est vide ou incomplète." >&2
  exit 1
fi
echo "Test de restauration réussi."
