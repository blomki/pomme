# 0044. Reprise des données depuis AmapJ

- Statut : accepté
- Date : 2026-11-23

## Contexte

Pour quitter AmapJ, Cambremer doit retrouver dans Pomme ses foyers, leurs adhésions, ses
producteurs et leurs produits, ainsi que le nombre de permanences déjà faites par chacun
(planning, story G2). AmapJ exporte ses listes en Excel ; les colonnes exactes de ses exports
restent à confirmer sur l'instance de Cambremer (point de cadrage ouvert). Les données réelles ne
doivent jamais servir en développement ni dans les tests.

## Décision

1. **Import CSV** dans « Réglages › Reprendre des données depuis AmapJ »
   (`/<amap>/admin/reprise`), réservé aux admins, en trois temps : foyers et adhésions, puis
   producteurs, puis produits.
2. **Colonnes reconnues par leur nom**, sans tenir compte des majuscules, des accents ni de la
   ponctuation ; l'ordre est libre et les autres colonnes sont ignorées. Un **modèle Pomme**
   (téléchargeable) donne un nom par colonne. Les **synonymes** (noms des exports AmapJ, des
   tableurs) sont dans un **fichier de correspondance**, `src/domain/import-mapping.json` :
   pour chaque colonne de Pomme, la liste des noms acceptés. Il se modifie sans toucher au code
   (mode d'emploi : `docs/import-amapj.md`) ; un test le vérifie à chaque modification.
3. **Lecture tolérante** (`domain/csv.ts`) : séparateur deviné (point-virgule, virgule ou
   tabulation), guillemets, BOM, fins de ligne Windows ; dates `jj/mm/aaaa` ; encodage UTF-8, ou
   à défaut Windows-1252 (Excel sous Windows).
4. **Aperçu puis import, par le même chemin** (`server/imports.ts`, `runImport(…, write)`) :
   chaque ligne est « à créer », « à compléter » (adhésion, antériorité), « déjà présente » ou
   « refusée » avec sa raison. Rien n'est écrit avant « Importer » ; les lignes refusées ne
   bloquent pas les autres. L'import est inscrit au journal.
5. **Pas de doublons** au réimport : une personne se reconnaît à son email (compte unique de la
   plateforme), un foyer, un producteur ou un produit à son nom dans l'AMAP (sans tenir compte
   des majuscules) ; une adhésion à ses dates. Une personne déjà membre d'un autre foyer de
   l'AMAP est refusée.
6. **Antériorité des permanences** : la colonne « Permanences faites » remplit
   `duty_history.imported_count`.
7. **Produits créés par un admin** : nouvelle politique `product_insert_by_admin` (migration
   0041). Un admin peut **créer** un produit d'un producteur de son AMAP ; la modification reste
   au référent et au producteur (politiques existantes).

## Pourquoi

- **CSV plutôt qu'Excel** : aucun lecteur de fichiers Excel à ajouter ni à maintenir (sécurité
  et poids de l'application) ; tout tableur sait enregistrer en CSV.
- **Reconnaissance par nom de colonne** plutôt qu'un écran d'association colonne par colonne :
  plus simple pour l'admin, et suffisant tant que les synonymes couvrent les exports réels.
- **Fichier de correspondance séparé du code** : les exports réels d'AmapJ ne sont pas encore
  connus ; quand ils le seront, il suffira d'y ajouter leurs en-têtes, sans modifier la logique.
- **Même chemin pour l'aperçu et l'import** : l'admin voit exactement ce qui sera fait.
- **Un producteur d'une autre AMAP n'est jamais rattaché par l'import** : sa fiche est commune ;
  le rattachement se fait à la main (« Rattacher un producteur »), en connaissance de cause.
- **Pas d'invitation envoyée à l'import** : l'AMAP choisit le moment d'inviter ses membres
  (« Renvoyer l'invitation » depuis la fiche du foyer) ; chacun se connecte avec son email.

## Conséquences

- Les tests n'utilisent que des fichiers fictifs (adresses `@example.org`).
- À faire quand les en-têtes des exports AmapJ de Cambremer seront connus : les ajouter au
  fichier de correspondance (sans aucune donnée réelle).
- Les commandes passées dans AmapJ ne sont pas reprises (hors périmètre de K1).
