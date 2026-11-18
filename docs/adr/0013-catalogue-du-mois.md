# 0013. Catalogue du mois : fiche produit commune, prix et disponibilités par AMAP

- Statut : accepté
- Date : 2026-11-16

## Contexte

Story C2 : le producteur ou son référent gère les fiches produit (nom, conditionnement, photo),
le prix propre à chaque AMAP et la disponibilité semaine par semaine. Un même producteur peut
livrer plusieurs AMAP (Les Ruches du Vallon dans le jeu de données). Deux questions avaient été
relevées entre les documents (écarts n° 1 et 5) : le catalogue est-il modifiable après
l'ouverture des commandes, et un référent d'une AMAP peut-il modifier une fiche qui sert aussi
aux autres AMAP ?

L'espace producteur (`/producteur`) est commun à toutes ses AMAP : le producteur y navigue
**hors de toute AMAP**, alors que la Row Level Security ne montre les données que de l'AMAP
courante (ADR 0003).

## Décision

1. **Quatre tables** :
   - `product` : fiche produit **commune au producteur**, donc à toutes ses AMAP. Le nom contient
     le conditionnement (« Œufs, boîte de 6 ») : un seul champ, comme à l'écran. `photo_url`
     prévu, l'envoi de fichiers ayant sa propre fiche (#64) ;
   - `catalog` : un catalogue par AMAP, producteur et **mois** (premier jour du mois), comme les
     distributions (ADR 0012). Statut `draft` ou `published` (publication : C3) ;
   - `catalog_item` : un produit dans un catalogue, avec son **prix en centimes** (> 0, contrôlé
     par la base), un `min_quantity` facultatif (possible techniquement, jamais affiché) et
     `removed_at` (« Produits retirés » de ce catalogue, que l'on peut remettre) ;
   - `catalog_item_availability` : une ligne = ce produit est disponible à cette distribution.
2. **Qui modifie** : le référent du producteur dans l'AMAP courante, ou le producteur lui-même
   (compte lié par `producer_user`). Ni l'admin ni les familles. Vérifié deux fois : par
   `requireCatalogEditor` dans le code, et par les politiques RLS (`isCatalogEditor`).
3. **La fiche est commune, assumé** (décision du 2026-11-15) : renommer un produit le renomme
   pour toutes les AMAP du producteur ; l'écran le dit. Un nouveau produit dont le nom
   correspond à une fiche existante du producteur la réutilise, au lieu d'en créer une seconde.
4. **Modifiable après l'ouverture** (décision du 2026-11-15) : un nouveau prix ne touche pas
   les commandes déjà enregistrées, qui garderont leur prix (`order_line`, story D). Chaque
   changement de prix est inscrit au journal.
5. **Espace producteur** : la fonction `list_my_producer_amaps()` (`SECURITY DEFINER`,
   migration 0019) donne au compte connecté les AMAP livrées par son producteur. Le catalogue
   se lit et s'enregistre ensuite **dans l'AMAP choisie** (`?amap=…`), avec la RLS habituelle.
6. **Un seul éditeur, deux dispositions** (`src/ui/catalog/CatalogEditor.tsx`) : un tableau pour
   le référent sur ordinateur (R6), une carte par produit pour le producteur sur téléphone (P2).

## Pourquoi

- Prix et disponibilités par AMAP : chaque AMAP a ses distributions et négocie ses prix ; la
  fiche commune évite au producteur de ressaisir ses produits dans chaque AMAP.
- Catalogue rattaché au mois plutôt qu'à la période de commande : même raison que l'ADR 0012
  (une période par mois, créée plus tard).
- Disponibilité en lignes (une par distribution cochée) plutôt qu'en tableau de booléens : les
  commandes pourront pointer exactement sur une disponibilité, et la clé étrangère composée
  (`distribution_id`, `amap_id`) empêche de viser une distribution d'une autre AMAP.
- Fonction plutôt que politique RLS pour l'espace producteur : une politique « le producteur
  voit ses liens » sur `amap_producer` ferait boucle avec celle de `producer_user`, qui lit
  déjà `amap_producer` (PostgreSQL refuse : « infinite recursion »). Elle ouvrirait aussi ces
  liens à l'intérieur d'une AMAP, où d'autres politiques comptent sur ce filtre. La fonction ne
  renvoie que les lignes du compte connecté et des informations déjà publiques (adresse et nom
  de l'AMAP) : même approche que `list_my_spaces()` (migration 0015).
- Écartés : un catalogue commun à toutes les AMAP (les prix diffèrent) ; une colonne
  « conditionnement » séparée (les maquettes n'en ont qu'une, et le nom suffit à la commande).

## Conséquences

- La story C3 (publication, reprise du mois précédent, archivage d'un produit) s'appuie sur ces
  tables sans les changer.
- Le choix durable de l'AMAP courante du producteur (C4) remplacera les onglets « Vos AMAP » de
  l'écran catalogue ; `list_my_producer_amaps()` servira aussi à son accueil.
- Pas de capture d'écran de référence pour ces écrans : ils exigent une connexion et affichent
  le mois prochain, donc changeraient chaque mois (ADR 0002). Les tests de bout en bout les
  couvrent, avec axe-core.
- À surveiller : renommer une fiche commune depuis une AMAP surprend peut-être un autre
  référent. Si cela pose problème, le journal permet de retrouver qui a changé quoi.

## Complément du 2026-11-18 : préparer, publier, lecture seule (story C3)

- **Préparer à partir du mois précédent** : bouton proposé tant que le mois n'a pas de
  catalogue et que le précédent propose au moins un produit. Les produits proposés sont repris
  à leurs prix et dans leur ordre ; les produits retirés ne le sont pas. **Aucune semaine
  n'est cochée** : les distributions changent d'un mois à l'autre, et une case cochée d'office
  risquerait d'être publiée sans relecture (« les disponibilités sont à revoir »).
- **Publier pour [mois]** enregistre puis publie. Refusé sans produit proposé, ou si un produit
  proposé n'a aucune semaine cochée (il faut cocher ou retirer). Un catalogue publié reste
  modifiable et publié (décision du 2026-11-16) ; pas de dépublication.
- **Lecture seule**, calculée : mois passé, ou commandes du mois clôturées (l'heure fait foi,
  ADR 0015). La réouverture des commandes rend le catalogue de nouveau modifiable. Le serveur
  refuse aussi toute modification ; un produit retiré reste lisible.
- **Tâche « Bloquant »** au tableau de bord admin : un catalogue pas encore publié à trois
  jours (ou moins) de l'ouverture des commandes, pour chaque producteur actif. Elle disparaît
  à la publication. Un producteur qui ne livre rien ce mois-là apparaît aussi : « Rien ce
  mois-ci » viendra avec les récapitulatifs.
- L'éditeur est remonté (`key`) à chaque changement de producteur, de mois ou de statut : il
  repart toujours du catalogue enregistré (auparavant, passer d'un onglet à l'autre pouvait
  garder les lignes saisies sur l'onglet précédent).
