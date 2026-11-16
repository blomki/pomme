# Déploiement chez Clever Cloud

Mise en route de la pré-production et de la production. Les choix sont expliqués dans
l'ADR 0008. Aucun secret dans ce fichier ni dans le dépôt : toutes les valeurs se saisissent
chez Clever Cloud ou dans les secrets de GitHub.

## Ressources

Organisation Clever Cloud « pomme » (`orga_1524590b-6edb-4a4d-9bfb-c7f021ab4738`), région Paris.

| Environnement  | Application                                                  | Base PostgreSQL                           |
| -------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Pré-production | `pomme-preprod` (`app_fca2a27f-93b6-46f9-ade4-f2ca84ab060c`) | plan XXS Small Space (passer du plan DEV) |
| Production     | `pomme-prod` (`app_7c2265ed-74dd-4db6-a5c2-597625514a38`)    | plan XXS Small Space, sauvegardes 7 jours |

Applications : taille nano, une seule instance (les limites de débit sont en mémoire), instance
de build dédiée en taille M (le build Next.js ne tient pas dans une nano). Aucun déploiement
automatique depuis Clever Cloud : c'est GitHub Actions qui déploie.

## Rôles PostgreSQL

Le propriétaire de chaque base doit pouvoir créer `pomme_app` et `pomme_auth` (droit
`CREATEROLE`). Le support de Clever Cloud l'accorde **sur les plans payants seulement** (pas
DEV), et active l'option « dump all » pour que les rôles survivent à une migration de la base
(ADR 0008). Pour chaque nouvelle base, lui écrire avec l'identifiant de l'add-on
(`postgresql_…`). **Ne pas déployer sur une base qui n'a pas encore ce droit** : le démarrage
échouerait à `pnpm db:setup`, et l'ancienne version resterait en ligne.

## Variables d'environnement de chaque application

| Variable                    | Valeur                                                                   |
| --------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                  | `production`                                                             |
| `CC_NODE_DEV_DEPENDENCIES`  | `install` (le build et les scripts de base en ont besoin)                |
| `CC_POST_BUILD_HOOK`        | `pnpm build`                                                             |
| `CC_PRE_RUN_HOOK`           | `bash clevercloud/pre-run.sh` (rôles et migrations)                      |
| `CC_HEALTH_CHECK_PATH`      | `/api/health`                                                            |
| `DATABASE_MIGRATION_URL`    | valeur de `POSTGRESQL_ADDON_URI` (propriétaire, ajoutée par la base)     |
| `DATABASE_URL`              | même adresse, avec `pomme_app` et un mot de passe aléatoire              |
| `DATABASE_AUTH_URL`         | même adresse, avec `pomme_auth` et un autre mot de passe aléatoire       |
| `BETTER_AUTH_URL`           | adresse publique (`https://app-….cleverapps.io` en attendant le domaine) |
| `BETTER_AUTH_SECRET`        | `openssl rand -base64 32`                                                |
| `SMTP_URL`, `EMAIL_FROM`    | relais Brevo (ADR 0006)                                                  |
| `FRIENDLY_CAPTCHA_SITEKEY`  | clé de site (ADR 0007)                                                   |
| `FRIENDLY_CAPTCHA_API_KEY`  | clé d'API (ADR 0007)                                                     |
| `FRIENDLY_CAPTCHA_ENDPOINT` | `eu` si l'offre le permet                                                |

Mots de passe : `openssl rand -hex 24` (sans caractère spécial, rien à encoder dans
l'adresse). Ne jamais définir `CAPTCHA_DISABLED` ni `POMME_DEMO_PAGES` sur ces applications.

## Déploiement depuis GitHub Actions

1. Créer un compte Clever Cloud réservé à la CI (une autre adresse email, double
   authentification), l'inviter dans l'organisation avec le rôle **Developer** : il peut
   déployer, pas facturer ni supprimer.
2. Avec ce compte : `npx clever-tools@5.3.0 login`, puis récupérer le _token_ et le _secret_
   affichés.
3. GitHub › Settings › Secrets and variables › Actions : secrets `CLEVER_TOKEN` et
   `CLEVER_SECRET`.
4. GitHub › Settings › Environments : créer `preprod`, et `production` avec le responsable
   du projet comme approbateur obligatoire (« Required reviewers »).

5. Quand la pré-production est configurée (rôles, variables d'environnement) : variable de
   dépôt `DEPLOY_ENABLED` = `true` (même page que les secrets, onglet « Variables »). C'est
   l'interrupteur des déploiements automatiques ; `false` les suspend.

Ensuite :

- **Pré-production** (`.github/workflows/deploy-preprod.yml`) : automatique après chaque CI
  au vert sur `main`.
- **Production** (`.github/workflows/deploy-production.yml`) : Actions › « Déployer en
  production » › Run workflow, avec le commit à déployer. Refusé si ce commit n'a pas été
  déployé avec succès en pré-production ; attend ensuite l'approbation.

Dans les journaux de Clever Cloud, un déploiement réussi affiche dans l'ordre :
`Rôle pomme_app prêt.`, `Rôle pomme_auth prêt.`, `Migrations appliquées.`, puis le démarrage
de Next.js. Si un pas échoue, l'ancienne version continue de servir. Vérifier ensuite
`https://<adresse>/api/health` : `{"status":"ok"}`.

## Domaine (quand il sera choisi, issue #49)

1. Clever Cloud › Domain names : ajouter le domaine, puis l'enregistrement DNS indiqué.
2. Activer « Force HTTPS ».
3. Mettre à jour `BETTER_AUTH_URL` (les passkeys créées sur une autre adresse ne marcheront
   plus).
4. Vérifier la note sur <https://developer.mozilla.org/en-US/observatory> (objectif : A+).
5. SPF, DKIM et DMARC pour les emails : ADR 0006.

## Reste à faire (fiche S7)

- Environnements de prévisualisation par pull request (application et base jetables).
- Sentry (région UE), à ajouter à la CSP.
- Sonde de disponibilité toutes les 5 minutes sur `/api/health`, avec alerte par email.
- Conservation des journaux pendant 30 jours.
- Tâches planifiées (`clevercloud/cron.json`) : avec les fiches qui en ont besoin (D2, D5, S8).
