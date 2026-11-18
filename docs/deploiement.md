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

| Variable                         | Valeur                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `NODE_ENV`                       | `production`                                                                       |
| `CC_NODE_DEV_DEPENDENCIES`       | `install` (le build et les scripts de base en ont besoin)                          |
| `CC_POST_BUILD_HOOK`             | `pnpm build`                                                                       |
| `CC_PRE_RUN_HOOK`                | `bash clevercloud/pre-run.sh` (rôles et migrations)                                |
| `CC_HEALTH_CHECK_PATH`           | `/api/health`                                                                      |
| `DATABASE_MIGRATION_URL`         | valeur de `POSTGRESQL_ADDON_URI` (propriétaire, ajoutée par la base)               |
| `DATABASE_URL`                   | même adresse, avec `pomme_app` et un mot de passe aléatoire                        |
| `DATABASE_AUTH_URL`              | même adresse, avec `pomme_auth` et un autre mot de passe aléatoire                 |
| `BETTER_AUTH_URL`                | `https://preprod.pomme.cloud` (pré-production), `https://pomme.cloud` (production) |
| `BETTER_AUTH_SECRET`             | `openssl rand -base64 32`                                                          |
| `SMTP_URL`, `EMAIL_FROM`         | relais Brevo (ADR 0006)                                                            |
| `FRIENDLY_CAPTCHA_SITEKEY`       | clé de site (ADR 0007)                                                             |
| `FRIENDLY_CAPTCHA_API_KEY`       | clé d'API (ADR 0007)                                                               |
| `FRIENDLY_CAPTCHA_ENDPOINT`      | `eu` si l'offre le permet                                                          |
| `NEXT_PUBLIC_SENTRY_DSN`         | clé Sentry de la région UE (`…ingest.de.sentry.io`), lue au build (ADR 0014)       |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `preprod` ou `production`                                                          |

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

- **Pré-production** (fin de `.github/workflows/ci.yml`) : automatique après chaque CI au
  vert sur `main`, ou à la main : Actions › CI › Run workflow, branche `main`.
- **Production** (`.github/workflows/deploy-production.yml`) : Actions › « Déployer en
  production » › Run workflow, avec le commit à déployer. Refusé si ce commit n'a pas été
  déployé avec succès en pré-production ; attend ensuite l'approbation.

Dans les journaux de Clever Cloud, un déploiement réussi affiche dans l'ordre :
`Rôle pomme_app prêt.`, `Rôle pomme_auth prêt.`, `Migrations appliquées.`, puis le démarrage
de Next.js. Si un pas échoue, l'ancienne version continue de servir. Vérifier ensuite
`https://<adresse>/api/health` : `{"status":"ok"}`.

## Domaine : pomme.cloud (OVH)

| Adresse               | Application     | Zone DNS chez OVH                                                |
| --------------------- | --------------- | ---------------------------------------------------------------- |
| `preprod.pomme.cloud` | `pomme-preprod` | `CNAME` `preprod` → `domain.par.clever-cloud.com.` (en place)    |
| `pomme.cloud`         | `pomme-prod`    | enregistrements `A` de la région Paris (racine : pas de `CNAME`) |

Pour chaque adresse :

1. Clever Cloud › application › Domain names : ajouter l'adresse ; le menu affiche les
   enregistrements à créer. Le certificat HTTPS (Let's Encrypt) suit tout seul.
2. Pour la racine `pomme.cloud` : supprimer d'abord les enregistrements `A` et `AAAA` créés par
   OVH (page « parking »), puis ajouter les `A` indiqués par Clever Cloud.
3. Activer « Force HTTPS ».
4. Mettre à jour `BETTER_AUTH_URL` (les passkeys créées sur une autre adresse ne marchent
   plus) et ajouter l'adresse aux domaines de l'application Friendly Captcha.
5. Vérifier la note sur <https://developer.mozilla.org/en-US/observatory> (objectif : A+).

Emails : `pomme.cloud` est authentifié dans Brevo (code de vérification, DKIM `brevo1` et
`brevo2`, DMARC `p=none`) ; `EMAIL_FROM="Pomme <ne-pas-repondre@pomme.cloud>"`, sans boîte de
réception derrière. SPF : `v=spf1 include:mx.ovh.com include:spf.brevo.com -all` (un seul
enregistrement SPF). Voir ADR 0006.

## Tâches planifiées (ADR 0015)

`clevercloud/cron.json` lance `clevercloud/cron-hourly.sh` à la 5e minute de chaque heure
(UTC), sur la première instance seulement : `pnpm jobs:hourly` ouvre et clôture les périodes de
commande. Clever Cloud installe les tâches à chaque déploiement (journal : « Importing
cronjobs ») ; leur sortie apparaît dans les journaux de l'application, préfixée par `CMDOUT`,
par exemple `Tâches horaires terminées (0 changement(s)).`

Essai à la main, sur un poste de développement : `pnpm jobs:hourly`.

## Surveillance (ADR 0014)

**Erreurs : Sentry.** Éteint tant que `NEXT_PUBLIC_SENTRY_DSN` est vide. Pour l'allumer :

1. Créer un compte sur <https://sentry.io>, en choisissant la région de données **UE**
   (Allemagne) à la création de l'organisation : elle ne se change plus ensuite.
2. Créer un projet de type « Next.js », copier sa clé (« Client Keys (DSN) ») : elle doit
   contenir `ingest.de.sentry.io`, sinon Pomme l'ignore.
3. Dans les réglages du projet : Security & Privacy › cocher « Prevent Storing of IP Addresses »
   (deuxième protection, en plus du filtrage fait par Pomme).
4. Clever Cloud › application › Environment variables : `NEXT_PUBLIC_SENTRY_DSN` et
   `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, puis redéployer (la clé est intégrée au build).

**Disponibilité : sonde GitHub Actions** (`.github/workflows/uptime.yml`). Toutes les
5 minutes, elle interroge `/api/health` des adresses de la variable de dépôt `UPTIME_URLS`
(séparées par des espaces ; la pré-production par défaut). En panne, elle ouvre une issue
« Panne » ; elle la ferme quand l'adresse répond de nouveau. Pour recevoir l'email : sur la page
du dépôt, « Watch » doit être sur « All activity » (ou au moins « Issues »). Essai à la main :
Actions › « Sonde de disponibilité » › Run workflow.

**Journaux.** Clever Cloud les garde 7 jours (`clever logs --since 2h`) ; on s'en tient là
(ADR 0014) : examiner un problème dans la semaine.

## Reste à faire (fiche S7)

- Production sur `pomme.cloud` : domaine, `UPTIME_URLS`, note A+ sur Mozilla Observatory.
- Autres tâches planifiées : avec les fiches qui en ont besoin (D5, S8).
