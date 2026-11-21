# Sauvegardes et reprise après incident

Objectif (cahier technique, section 6) : perdre au plus 24 heures de données et redémarrer en
moins de 4 heures. Choix et raisons : ADR 0036.

## Ce qui est sauvegardé, et où

| Quoi                                               | Où                                                          | Combien de temps                             |
| -------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| Base de production                                 | Clever Cloud, sauvegarde automatique de l'add-on PostgreSQL | 7 jours (plan actuel)                        |
| Base de production, copie chiffrée                 | Scaleway Object Storage (Paris), `daily/`                   | 31 jours                                     |
| Base, copie du 1er du mois                         | Scaleway, `monthly/`                                        | 366 jours                                    |
| Fichiers déposés (photos, logos, images des pages) | Scaleway, `files/`                                          | versions remplacées ou supprimées : 30 jours |

Les copies de la base sont **chiffrées avec age** pour deux clés :

- la **clé hors ligne**, gardée par deux personnes : c'est elle qui sert en cas de vrai
  incident ;
- la **clé du test de restauration**, rangée dans les secrets GitHub : elle permet au test
  mensuel de déchiffrer la dernière copie.

Chaque copie est **verrouillée** (Object Lock, mode « compliance ») jusqu'à sa date
d'expiration : personne ne peut l'effacer avant, pas même le titulaire du compte Scaleway. Un
pirate qui volerait les clés ne pourrait pas détruire les sauvegardes.

Les tâches : `.github/workflows/sauvegardes.yml` (chaque nuit à 2 h 30 ou 3 h 30 ; le test de
restauration le 3 de chaque mois), scripts dans `scripts/backup/`.

## Mise en place (une seule fois)

### 1. Les clés age

Sur un ordinateur de confiance, avec [age](https://age-encryption.org) installé :

```zsh
age-keygen -o pomme-hors-ligne.txt
age-keygen -o pomme-test-restauration.txt
```

Chaque commande affiche la **clé publique** (`age1…`) ; la clé privée est dans le fichier.

- `pomme-hors-ligne.txt` : **imprimer** le fichier et le copier sur deux clés USB, gardés par
  deux personnes différentes, hors ligne. Puis effacer le fichier de l'ordinateur. Sans cette
  clé, une copie externe est illisible : la perdre, c'est perdre les sauvegardes.
- `pomme-test-restauration.txt` : son contenu va dans le secret GitHub
  `RESTORE_AGE_IDENTITY` (étape 3), puis effacer le fichier.

### 2. Le stockage Scaleway

1. Créer un compte sur [scaleway.com](https://www.scaleway.com), projet « Pomme ».
2. Object Storage › Créer un bucket : région **Paris (fr-par)**, nom par exemple
   `pomme-sauvegardes`, **visibilité privée**, **Object Lock activé**. L'Object Lock ne peut
   être activé qu'à la création du bucket.
3. Règles de cycle de vie du bucket : effacement automatique après les délais de conservation.
   - `daily/` : expiration après 32 jours ;
   - `monthly/` : expiration après 367 jours ;
   - `files/` : versions anciennes expirées après 30 jours.
4. IAM › Applications › créer une application « sauvegardes-github » avec une politique limitée
   à **Object Storage** de ce projet, puis générer une clé d'API : on obtient un identifiant
   (`SCW…`) et une clé secrète.

### 3. Les réglages GitHub

Settings › Secrets and variables › Actions :

| Nom                        | Type     | Valeur                                                                                     |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `BACKUP_DATABASE_URL`      | secret   | adresse de la base de production (compte propriétaire de l'add-on, `POSTGRESQL_ADDON_URI`) |
| `SCW_ACCESS_KEY_ID`        | secret   | identifiant de la clé d'API Scaleway                                                       |
| `SCW_SECRET_ACCESS_KEY`    | secret   | clé secrète Scaleway                                                                       |
| `RESTORE_AGE_IDENTITY`     | secret   | contenu de `pomme-test-restauration.txt`                                                   |
| `CELLAR_ACCESS_KEY_ID`     | secret   | clé Cellar de production (`CELLAR_ADDON_KEY_ID`)                                           |
| `CELLAR_SECRET_ACCESS_KEY` | secret   | `CELLAR_ADDON_KEY_SECRET`                                                                  |
| `BACKUP_BUCKET`            | variable | `pomme-sauvegardes`                                                                        |
| `BACKUP_AGE_RECIPIENTS`    | variable | les **deux clés publiques**, séparées par un espace                                        |
| `CELLAR_BUCKET`            | variable | bucket des fichiers de production                                                          |
| `BACKUP_ENABLED`           | variable | `true`, en dernier                                                                         |

Puis Actions › « Sauvegardes » › Run workflow › `sauvegarde` : le passage doit afficher
« Envoyé : daily/… ». Lancer ensuite `restauration` : il doit afficher « Test de restauration
réussi ».

## Que faire si une sauvegarde échoue

Une issue « Sauvegarde : … » s'ouvre (email de GitHub). Ouvrir le lien du passage, lire
l'erreur :

- **connexion à la base refusée** : le mot de passe de l'add-on a changé ? Mettre à jour
  `BACKUP_DATABASE_URL` ;
- **accès refusé chez Scaleway** : clé d'API expirée ou révoquée ? En générer une nouvelle ;
- **« Il faut deux clés publiques age »** : vérifier `BACKUP_AGE_RECIPIENTS`.

Relancer à la main (Run workflow) : l'issue se ferme toute seule au premier passage réussi.
Pendant ce temps, la sauvegarde de Clever Cloud continue (7 jours).

## Reprise : restaurer la base

### Cas 1 : erreur récente, Clever Cloud fonctionne

Le plus rapide. Console Clever Cloud › add-on PostgreSQL de production › Backups : restaurer la
sauvegarde voulue (de moins de 7 jours) dans l'add-on, ou dans un nouvel add-on pour comparer
d'abord.

### Cas 2 : Clever Cloud indisponible, ou sauvegarde plus ancienne

1. Récupérer la copie chez Scaleway (console › bucket › `daily/` ou `monthly/` ›
   télécharger), par exemple `pomme-2027-03-14.dump.age`.
2. La déchiffrer avec la clé hors ligne :

   ```zsh
   age --decrypt --identity pomme-hors-ligne.txt --output pomme.dump pomme-2027-03-14.dump.age
   ```

3. Créer une base PostgreSQL 17 vide (nouvel add-on Clever Cloud, ou autre hébergeur), puis :

   ```zsh
   pg_restore --no-owner --no-privileges --exit-on-error --dbname "<adresse de la nouvelle base>" pomme.dump
   ```

4. Brancher l'application sur la nouvelle base : variables d'environnement de l'application
   (`DATABASE_*`), puis redéployer. Au démarrage, `clevercloud/pre-run.sh` recrée les rôles
   `pomme_app` et `pomme_auth` et leurs droits (docs/deploiement.md).
5. Vérifier : connexion d'un admin, liste des foyers, commandes du mois.
6. Effacer `pomme.dump` (données personnelles en clair).

## Reprise : restaurer les fichiers

Les fichiers sont dans le bucket Scaleway, sous `files/`, avec la même arborescence que chez
Cellar. Pour tout recopier vers un bucket Cellar (neuf ou vidé) :

```zsh
aws --endpoint-url https://s3.fr-par.scw.cloud s3 sync s3://pomme-sauvegardes/files ./fichiers
aws --endpoint-url https://cellar-c2.services.clever-cloud.com s3 sync ./fichiers s3://<bucket-cellar>
```

Un fichier supprimé par erreur il y a moins de 30 jours : console Scaleway › bucket › afficher
les versions › restaurer la version voulue.

## Exercice annuel

Une fois par an, refaire le cas 2 à la main dans une base de test, avec la **vraie clé hors
ligne** : c'est la seule façon de vérifier que la clé est toujours lisible et que la procédure
est à jour. Noter la date et le temps passé ici :

| Date | Durée | Par | Remarques |
| ---- | ----- | --- | --------- |
|      |       |     |           |
