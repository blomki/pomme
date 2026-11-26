# 0049. Images des bandeaux, par famille d'écrans

- Statut : accepté
- Date : 2026-11-26

## Contexte

La charte du 2026-11-26 (story S14, fiche #115, section 8) prévoit une image à droite du
bandeau de chaque écran des espaces admin et référent : un personnage, une illustration ou une
simple icône, propres à chaque AMAP, « une image par écran ou par famille d'écrans », avec une
image par défaut si l'AMAP n'en a pas fourni.

## Décision

1. **Six familles d'écrans** (`src/domain/banner-images.ts`) : tableaux de bord et réglages ;
   foyers et adhésions ; producteurs, catalogues et bons de commande ; distributions et
   permanences ; chèques, avoirs et signalements ; emails et pages du site. La famille se déduit
   de l'adresse (`bannerGroupFor`) : le premier segment après l'espace. Un écran nouveau ou
   inconnu revient au tableau de bord.
2. **Image par défaut : le logo de l'AMAP.** Sans logo, le bandeau n'a pas d'image.
3. **Une colonne `amap.banner_images`** (JSON : famille → adresse publique de l'image). Les
   images suivent les règles de l'ADR 0022 : contrôlées, ré-encodées en WebP (512 points au
   plus), stockées dans le dossier `bandeaux/`, supprimées du stockage quand elles sont
   remplacées ou retirées.
4. **Réglées dans « Réglages » par un admin** (deuxième vérification), sous le logo, une image
   par famille, avec l'envoi d'image habituel (`ImageUpload`). Chaque envoi et chaque retrait
   est journalisé (`update_banner_image`, `remove_banner_image`).
5. **Images décoratives** : texte alternatif vide, ignorées par les lecteurs d'écran. Le titre
   du bandeau dit déjà de quel écran il s'agit.
6. **Le gabarit fournit les images** (`DesktopShell`, contexte React) : le bandeau choisit
   celle de l'écran ouvert. Les pages n'ont rien à transmettre.

## Pourquoi

- **Familles plutôt qu'écrans** : vingt-six images, c'est trop pour une petite AMAP. Six
  suffisent à varier l'interface et à repérer où l'on est.
- **Déduire la famille de l'adresse** plutôt que de la noter dans chaque page : un écran ajouté
  plus tard a une image sans y penser, et la règle tient dans une fonction pure, testée.
- **Une colonne JSON plutôt qu'une table** : six adresses au plus, toujours lues avec l'AMAP,
  jamais cherchées seules.

## Conséquences

- Ajouter une route sous `admin/` ou `referent/` : penser à la ranger dans `SECTION_GROUPS` si
  elle ne relève pas du tableau de bord.
- Les espaces famille et producteur n'ont pas de bandeau : rien ne change pour eux.
