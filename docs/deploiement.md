# Déploiement : Clever Cloud et Scaleway

Mise en route de la pré-production ou de la production. Les choix sont expliqués dans
l'ADR 0008. Aucun secret dans ce fichier ni dans le dépôt : toutes les valeurs se saisissent
chez l'hébergeur.

## 1. Base PostgreSQL chez Scaleway

1. Console Scaleway › Managed Databases › créer une instance : **PostgreSQL 17**, région
   **Paris**, plus petite taille, sauvegardes automatiques activées.
2. Créer une base logique `pomme` (une par environnement : `pomme_preprod`, `pomme`…).
3. Utilisateur **admin** de l'instance (créé avec elle) : il sert aux migrations. Mot de passe
   long et aléatoire. Il doit avoir les droits « All » sur la base logique.
4. Télécharger le **certificat TLS** de l'instance (onglet « Overview » › certificat) : il ira
   dans `DATABASE_CA_CERT`.
5. Noter l'adresse de connexion (nom d'hôte et port). Utiliser le nom d'hôte, pas l'adresse IP :
   le certificat est vérifié avec ce nom.
6. Dès que possible, restreindre les adresses autorisées (« Allowed IPs ») aux adresses de
   sortie de Clever Cloud.

Les rôles `pomme_app` et `pomme_auth` ne se créent **pas** dans la console : l'application les
crée elle-même au premier démarrage (`pnpm db:setup`), avec les mots de passe des variables
ci-dessous.

## 2. Application chez Clever Cloud

1. Console Clever Cloud › créer une application **Node.js**, région **Paris**, depuis le dépôt
   GitHub. Taille la plus petite pour commencer.
2. Variables d'environnement (onglet « Environment variables ») :

| Variable                    | Valeur                                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                  | `production`                                                               |
| `CC_NODE_DEV_DEPENDENCIES`  | `install` (le build et les scripts de base en ont besoin)                  |
| `CC_POST_BUILD_HOOK`        | `pnpm build`                                                               |
| `CC_PRE_RUN_HOOK`           | `bash clevercloud/pre-run.sh` (rôles et migrations)                        |
| `CC_HEALTH_CHECK_PATH`      | `/api/health`                                                              |
| `DATABASE_MIGRATION_URL`    | `postgres://admin:…@<hôte>:<port>/pomme` (utilisateur admin de Scaleway)   |
| `DATABASE_URL`              | `postgres://pomme_app:<mot de passe aléatoire>@<hôte>:<port>/pomme`        |
| `DATABASE_AUTH_URL`         | `postgres://pomme_auth:<autre mot de passe aléatoire>@<hôte>:<port>/pomme` |
| `DATABASE_CA_CERT`          | contenu du certificat téléchargé (`-----BEGIN CERTIFICATE-----…`)          |
| `BETTER_AUTH_URL`           | adresse publique, par exemple `https://<domaine>`                          |
| `BETTER_AUTH_SECRET`        | `openssl rand -base64 32`                                                  |
| `SMTP_URL`, `EMAIL_FROM`    | relais Brevo (ADR 0006)                                                    |
| `FRIENDLY_CAPTCHA_SITEKEY`  | clé de site (ADR 0007)                                                     |
| `FRIENDLY_CAPTCHA_API_KEY`  | clé d'API (ADR 0007)                                                       |
| `FRIENDLY_CAPTCHA_ENDPOINT` | `eu` si l'offre le permet                                                  |

Mots de passe : `openssl rand -hex 24` (sans caractère spécial, rien à encoder dans
l'adresse). Ne jamais mettre `sslmode=…` dans les adresses : le chiffrement est réglé par
`DATABASE_CA_CERT`. Ne jamais définir `CAPTCHA_DISABLED` ni `POMME_DEMO_PAGES` ici.

Le certificat contient des retours à la ligne ; avec Clever Tools :
`clever env set DATABASE_CA_CERT "$(cat certificat.pem)"`.

3. Déployer. Dans les journaux, vérifier dans l'ordre : `Rôle pomme_app prêt.`,
   `Rôle pomme_auth prêt.`, `Migrations appliquées.`, puis le démarrage de Next.js. Si un de ces
   pas échoue, Clever Cloud garde l'ancienne version.
4. Ouvrir `https://<application>/api/health` : `{"status":"ok"}`.

## 3. Domaine (quand il sera choisi, issue #49)

1. Clever Cloud › Domain names : ajouter le domaine, puis l'enregistrement DNS indiqué.
2. Activer « Force HTTPS ».
3. Mettre à jour `BETTER_AUTH_URL` (les liens de connexion et les passkeys en dépendent : les
   passkeys créées sur une autre adresse ne marcheront plus).
4. Vérifier la note sur <https://developer.mozilla.org/en-US/observatory> (objectif : A+).
5. SPF, DKIM et DMARC pour les emails : ADR 0006.

## Reste à faire (fiche S7)

- Environnements de prévisualisation par pull request et de pré-production, déploiement en
  production par bouton : workflows GitHub à écrire une fois les comptes créés.
- Sentry (région UE) : à ajouter à la CSP.
- Sonde de disponibilité toutes les 5 minutes sur `/api/health`, avec alerte par email.
- Durée de conservation des journaux (30 jours).
- Tâches planifiées (`clevercloud/cron.json`) : avec les fiches qui en ont besoin (D2, D5, S8).
