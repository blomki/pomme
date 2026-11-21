#!/usr/bin/env bash
# Sauvegarde externe de la base (fiche S8, ADR 0036) : pg_dump, chiffrement avec age, envoi sur
# le stockage objet de Scaleway (Paris). Lancé chaque nuit par .github/workflows/sauvegardes.yml.
#
# Variables attendues :
#   DATABASE_URL     base à sauvegarder (compte propriétaire : pg_dump doit tout lire)
#   AGE_RECIPIENTS   clés publiques age, séparées par des espaces : la clé hors ligne (gardée par
#                    deux personnes) et celle du test de restauration mensuel
#   S3_ENDPOINT      ex. https://s3.fr-par.scw.cloud
#   S3_REGION        ex. fr-par
#   S3_BUCKET        compartiment des sauvegardes
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   clés de ce compartiment
#   OBJECT_LOCK      « 1 » : chaque fichier est verrouillé (non effaçable) jusqu'à sa date
#                    d'expiration. « 0 » pour un essai sur un stockage sans verrouillage.
#   BACKUP_DATE      jour de la sauvegarde (AAAA-MM-JJ), par défaut aujourd'hui (UTC)
#
# Rangement : daily/pomme-AAAA-MM-JJ.dump.age, gardé 31 jours ; le 1er du mois, la même copie
# aussi dans monthly/pomme-AAAA-MM.dump.age, gardée 366 jours. D'où 30 quotidiennes et 12
# mensuelles. La suppression après ces délais est faite par les règles de cycle de vie du
# compartiment (docs/reprise.md).
set -euo pipefail

# Le client AWS récent ajoute par défaut des sommes de contrôle que les stockages compatibles S3
# (Scaleway, Cellar, SeaweedFS en local) n'acceptent pas toujours : seulement si nécessaire.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

: "${DATABASE_URL:?}" "${AGE_RECIPIENTS:?}" "${S3_ENDPOINT:?}" "${S3_REGION:?}" "${S3_BUCKET:?}"
OBJECT_LOCK="${OBJECT_LOCK:-1}"
day="${BACKUP_DATE:-$(date -u +%F)}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

recipients=()
keys=0
for key in $AGE_RECIPIENTS; do
  recipients+=(--recipient "$key")
  keys=$((keys + 1))
done
if [ "$keys" -lt 2 ]; then
  echo "Il faut deux clés publiques age (hors ligne + test de restauration)." >&2
  exit 1
fi

# Format « custom » de pg_dump : compressé, et pg_restore peut ne reprendre qu'une partie.
# Sans propriétaires ni droits : la base de reprise a ses propres rôles (docs/reprise.md).
# Le fichier en clair n'est jamais écrit sur le disque : pg_dump écrit directement dans age.
file="$work/pomme-$day.dump.age"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" | age "${recipients[@]}" > "$file"
size=$(stat -c %s "$file")
if [ "$size" -lt 1024 ]; then
  echo "Sauvegarde suspecte : $size octets seulement." >&2
  exit 1
fi

s3() { aws --endpoint-url "$S3_ENDPOINT" --region "$S3_REGION" "$@"; }

# Envoi d'un fichier ; avec OBJECT_LOCK=1, verrouillé en mode « compliance » jusqu'à la date
# donnée : personne, pas même le titulaire du compte, ne peut l'effacer avant.
upload() {
  local key="$1" days="$2"
  local lock=()
  if [ "$OBJECT_LOCK" = "1" ]; then
    lock=(--object-lock-mode COMPLIANCE
      --object-lock-retain-until-date "$(date -u -d "$day + $days days" +%FT%TZ)")
  fi
  s3 s3api put-object --bucket "$S3_BUCKET" --key "$key" --body "$file" "${lock[@]}" >/dev/null
  # Vérification : le fichier est bien là, avec la bonne taille.
  local stored
  stored=$(s3 s3api head-object --bucket "$S3_BUCKET" --key "$key" --query ContentLength --output text)
  if [ "$stored" != "$size" ]; then
    echo "Envoi incomplet pour $key : $stored octets au lieu de $size." >&2
    exit 1
  fi
  echo "Envoyé : $key ($size octets)"
}

upload "daily/pomme-$day.dump.age" 31
if [ "${day:8:2}" = "01" ]; then
  upload "monthly/pomme-${day:0:7}.dump.age" 366
fi
