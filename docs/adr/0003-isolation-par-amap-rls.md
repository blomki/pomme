# 0003. Base de données et isolation des AMAP par Row Level Security

- Statut : accepté
- Date : 2026-11-05

## Contexte

Pomme héberge plusieurs AMAP dans une seule base. Une erreur de code (un filtre oublié dans une
requête) ne doit jamais exposer les foyers, commandes ou chèques d'une AMAP à une autre. L'ancien
outil a été piraté plusieurs fois : la sécurité passe avant le confort (cahier technique,
section 5).

## Décision

1. **Drizzle ORM** décrit les tables en TypeScript (`src/db/schema`) ; `drizzle-kit` en déduit
   des migrations SQL versionnées (`src/db/migrations`), relues en pull request et appliquées
   au déploiement. La CI échoue si le schéma a changé sans migration.
2. **Row Level Security (RLS)** de PostgreSQL sur chaque table. Au début de chaque transaction,
   `withAmapContext` fixe deux variables : `app.amap_id` (l'AMAP courante) et `app.user_id`
   (l'utilisateur connecté). Les politiques de chaque table les lisent : PostgreSQL ne renvoie
   et n'accepte que les lignes de l'AMAP courante. Sans contexte, rien n'est visible.
3. **Deux rôles PostgreSQL** :
   - le **propriétaire** crée les tables (migrations) et charge le jeu de données fictif ;
   - **`pomme_app`**, utilisé par l'application, lit et écrit sans être propriétaire :
     il ne peut ni désactiver la RLS, ni supprimer une politique, ni créer de table, et n'a pas
     l'attribut `BYPASSRLS`. Il est créé par `pnpm db:setup`.
4. **Deux barrières** : `requireRole` vérifie le rôle (admin, référent) au début de chaque
   Server Action ; la RLS garantit l'isolation par AMAP même si cette vérification manquait.
5. **Journal** (`audit_log`) écrit par `writeAuditLog` dans la transaction de l'action ; aucune
   politique de modification ou de suppression : il est en écriture seule pour l'application.
6. **Identifiants UUID v7** générés par l'application (PostgreSQL 17 ne les produit pas).

## Pourquoi

- La RLS place l'isolation **dans la base** : elle s'applique à toutes les requêtes, y compris
  celles écrites plus tard ou par erreur, et les tests le prouvent avec le vrai rôle applicatif
  (`tests/integration/rls.test.ts`).
- `set_config(…, true)` limite les variables à la transaction : une connexion du pool,
  réutilisée ensuite, ne garde pas le contexte d'un autre utilisateur.
- Drizzle reste proche du SQL (lisible, migrations en SQL clair) et déclare les politiques RLS
  à côté des tables.

Écartés : une base par AMAP (lourd à administrer et à faire évoluer) ; un filtre `amap_id`
seulement dans le code (un oubli suffit à exposer des données).

## Conséquences

- Toute lecture ou écriture de données d'une AMAP passe par `withAmapContext`.
- Une nouvelle table métier porte un `amap_id` et ses politiques ; le test « activent la RLS sur
  toutes les tables » échoue sinon.
- Les informations d'une AMAP (nom, adresse, thème) restent lisibles par tous : elles sont
  publiques.
- Une insertion suivie de `RETURNING` exige que la nouvelle ligne soit aussi lisible : créer un
  compte pour quelqu'un d'autre se fait sans `RETURNING` (identifiant généré à l'avance).
- Retrouver un compte existant par son email, hors de l'AMAP courante (invitation, story A2),
  et créer une AMAP (story J1) demanderont chacun une fonction de base dédiée
  (`SECURITY DEFINER`), aux droits limités à cette seule opération.
- En production, l'hébergeur doit permettre de créer le rôle `pomme_app` (à vérifier avec
  Clever Cloud, fiche S7).
