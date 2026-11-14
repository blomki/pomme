# 0008. Hébergement : application chez Clever Cloud, base PostgreSQL chez Scaleway

- Statut : accepté
- Date : 2026-11-14

## Contexte

Le cahier technique (section 8) prévoit tout chez Clever Cloud : l'application Node.js, la
base PostgreSQL et le stockage des fichiers (Cellar). Mais l'isolation entre AMAP (ADR 0003)
demande trois rôles PostgreSQL : le propriétaire des tables (migrations), `pomme_app`
(l'application) et `pomme_auth` (Better Auth). Ces deux derniers ne possèdent pas les tables :
ils ne peuvent ni désactiver ni contourner la Row Level Security.

La base gérée de Clever Cloud ne le permet pas : on n'y a qu'un seul utilisateur, propriétaire
de tout (« users administration » non disponible, sauf accord du support). Se connecter en
propriétaire affaiblirait la protection principale contre les fuites entre AMAP.

## Décision

1. **Application Node.js chez Clever Cloud** (Paris), comme prévu : déploiement depuis Git,
   HTTPS, sonde de santé, tâches planifiées (`clevercloud/cron.json`).
2. **PostgreSQL 17 géré chez Scaleway** (Managed Database, région Paris). Son utilisateur
   « admin » a le droit `CREATEROLE` (sans être super-utilisateur) : `pnpm db:setup` y crée
   `pomme_app` et `pomme_auth` comme en local.
3. **Connexion chiffrée et vérifiée** : TLS avec vérification du certificat de l'instance
   Scaleway (`DATABASE_CA_CERT`, voir `src/db/client.ts`).
4. **Au démarrage** (`clevercloud/pre-run.sh`, sur la première instance seulement) :
   `pnpm db:setup` puis `pnpm db:migrate`. Clever Cloud ne bascule sur la nouvelle version que
   si `/api/health` répond 200 (application et base joignables).
5. **En-têtes de sécurité** sur toutes les réponses (`next.config.ts`) et **Content-Security-
   Policy avec nonce** sur chaque page (`src/proxy.ts`), voir
   `src/server/security-headers.ts`.

## Pourquoi

- Garder les rôles séparés : c'est la deuxième barrière de l'ADR 0003, celle qui protège même
  d'une erreur dans le code.
- Scaleway : entreprise française, données à Paris, déjà retenu pour les copies de sauvegarde
  (fiche S8). Sa base gérée permet de créer des rôles.
- Options écartées :
  - se connecter en propriétaire avec `FORCE ROW LEVEL SECURITY` : le propriétaire peut
    désactiver la RLS d'une simple commande, et Better Auth ne serait plus isolé ;
  - demander une exception au support de Clever Cloud : réponse incertaine, et dépendance à un
    réglage hors du contrat standard ;
  - un serveur PostgreSQL installé à la main : mises à jour et sécurité à notre charge, ce que
    le cahier technique veut éviter.
- Toutes les pages sont construites à la demande : c'est le prix du nonce (Next.js ne peut pas
  l'ajouter à une page construite d'avance). Pour 40 foyers, sans conséquence.
- `style-src 'unsafe-inline'` : MUI écrit des styles en attribut, qu'un nonce ne couvre pas. Un
  style injecté ne peut pas exécuter de code ; les scripts, eux, restent strictement contrôlés.

## Conséquences

- Deux fournisseurs au lieu d'un : deux comptes, deux factures. **Coût à vérifier** sur les
  grilles tarifaires (objectif du cahier : moins de 20 € par mois).
- La base est joignable par Internet (l'application de Clever Cloud n'est pas dans le réseau
  privé de Scaleway) : mots de passe longs et aléatoires, TLS vérifié, et liste des adresses
  autorisées de Scaleway restreinte dès que possible (à voir avec les adresses de sortie de
  Clever Cloud). Quelques millisecondes de plus par requête (même ville).
- Sauvegardes : celles de Scaleway, plus la copie chiffrée de la fiche S8.
- Adresse IP des visiteurs (limites de débit) : la dernière de `X-Forwarded-For`, ajoutée par
  le répartiteur de Clever Cloud ; la première peut être inventée (`src/server/auth/client-ip.ts`).
- Les environnements de prévisualisation par PR (bases jetables) et la pré-production
  demanderont une base logique par environnement sur l'instance Scaleway.
- Une nouvelle origine externe (par exemple Sentry) devra être ajoutée à la CSP.
- Les migrations doivent rester compatibles avec la version précédente : pendant un
  déploiement, l'ancienne version tourne sur la base déjà migrée.
- Mise en route pas à pas : `docs/deploiement.md`.
