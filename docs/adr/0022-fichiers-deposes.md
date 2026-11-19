# 0022. Fichiers déposés : stockage objet, images ré-encodées

- Statut : accepté
- Date : 2026-11-19

## Contexte

Plusieurs écrans ont besoin d'images déposées par les utilisateurs : photo du producteur (C1),
photos des produits (C2), logo de l'AMAP (A4). Une image venue d'un téléphone est lourde, porte
souvent la position GPS de la prise de vue, et un fichier peut se faire passer pour une image
(script renommé en « .jpg », contenu caché après l'image). Le serveur web de Clever Cloud ne
garde pas ses fichiers d'un déploiement à l'autre (fiche S11, cahier technique, sections 5 et 8).

## Décision

1. **Stockage objet compatible S3, hors du serveur web** : Cellar chez Clever Cloud, un bucket
   par environnement. En local et dans la CI : SeaweedFS (service `files` de
   `docker-compose.yml`), parce que MinIO ne publie plus d'image Docker depuis fin 2025.
2. **Images publiques, lues directement dans le stockage** par le navigateur, à une adresse
   imprévisible (un identifiant tiré au hasard) : `…/pomme-fichiers/producteurs/<uuid>.webp`.
   Lecture seule pour tous ; ni liste du contenu, ni écriture. L'origine du stockage est ajoutée
   à `img-src` de la Content-Security-Policy. La base garde l'adresse publique (`photo_url`,
   `logo_url`) et un texte alternatif (`photo_alt`).
3. **Contrôles côté serveur**, refaits quel que soit l'écran : 8 Mo au plus, et un vrai JPEG,
   PNG ou WebP, reconnu à ses premiers octets (`domain/images.ts`). Le navigateur prévient plus
   tôt, mais ne décide pas.
4. **Ré-encodage systématique** (`server/files/images.ts`, bibliothèque sharp) : image décodée
   puis réécrite en WebP, orientation appliquée, métadonnées supprimées, réduite à la taille de
   son usage (1 200 points pour une photo de producteur, 800 pour un produit, 512 pour un logo).
   Une image de plus de 50 millions de points est refusée (« bombe de décompression »).
5. **Qui change la photo d'un producteur** : son référent, ou un admin de l'AMAP avec la
   deuxième vérification (même règle que la correction des commandes, `referentOrAdminAccess`).
   La photo est commune à toutes les AMAP du producteur, comme sa fiche (ADR 0011).
6. **Image remplacée ou retirée : supprimée du stockage**, après la validation de la
   transaction. Un envoi refusé ne stocke rien ; un fichier stocké dont l'enregistrement en base
   échoue est aussitôt supprimé.
7. **Sans stockage configuré** (`FILES_BUCKET` absent), l'application marche, mais l'envoi est
   désactivé avec un message à l'écran.

## Pourquoi

- Un stockage objet survit aux déploiements et ne charge pas le serveur de l'application ; le
  protocole S3 est le même chez Cellar, SeaweedFS et la plupart des hébergeurs : changer
  d'hébergeur ne touche pas au code.
- Servir les images directement depuis le stockage évite de faire passer chaque image par
  l'application (petite instance nano). Écarté : une route de l'application qui relit chaque
  image ; utile seulement pour des fichiers privés, que Pomme n'a pas.
- Ré-encoder est plus sûr que vérifier : on ne garde que les points de l'image, et le format de
  sortie est toujours le même. WebP est lu par tous les navigateurs actuels et pèse environ un
  tiers d'un JPEG.
- SVG refusé : c'est un format texte qui peut contenir du script.
- HEIC (iPhone) refusé : Safari convertit la photo en JPEG quand le champ ne propose que JPEG,
  PNG et WebP.

## Conséquences

- Chaque environnement de Clever Cloud a besoin de son add-on Cellar et de `FILES_BUCKET`
  (docs/deploiement.md) ; le bucket est préparé au démarrage (`pnpm files:setup`).
- Le logo de l'AMAP (A4) et les photos des produits (C2) n'ont plus qu'à brancher l'écran : les
  réglages de taille sont prêts (`IMAGE_USAGES`), les colonnes existent.
- Les fichiers ne sont pas encore dans les sauvegardes externes : à ajouter avec la fiche S8,
  qui copiera aussi le bucket.
- Les adresses stockées contiennent le service et le bucket : en cas de changement de
  stockage, une mise à jour en base les réécrit.
