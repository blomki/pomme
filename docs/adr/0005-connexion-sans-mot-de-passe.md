# 0005. Connexion sans mot de passe avec Better Auth

- Statut : accepté (partie 1 : lien magique, passkeys, sessions)
- Date : 2026-11-05

## Contexte

Les familles se connectent quelques fois par mois, souvent sur téléphone : un mot de passe est
vite oublié, réutilisé ou volé. Le cahier des charges (story A1) demande une connexion sans mot
de passe, et une deuxième vérification pour les administrateurs.

## Décision

1. **Better Auth** gère comptes et sessions, avec les plugins `magicLink`, `passkey`
   (`@better-auth/passkey`) et, en partie 2, `twoFactor`. Connexion email + mot de passe
   désactivée : il n'existe aucun mot de passe dans Pomme.
2. **Lien magique** : à usage unique, valable 15 minutes, jeton stocké haché. Jamais de création
   de compte par ce biais (`disableSignUp`) : les comptes sont créés par les admins (A2).
   Même réponse que l'adresse soit inscrite ou non, et aucun email vers une adresse inconnue.
3. **Passkeys** proposées juste après la première connexion, et gérées dans « Mon compte ».
4. **Sessions** : cookie `pomme.session_token`, HttpOnly, SameSite=Lax, Secure en HTTPS ;
   nouveau jeton à chaque connexion ; 30 jours, prolongés à l'usage ; « Me déconnecter de tous
   mes appareils » révoque toutes les sessions du compte.
5. **Limitation de débit** dans l'action de demande de lien : 3 liens par email et 10 demandes
   par adresse IP par quart d'heure (en mémoire, une instance en V1). Captcha : fiche S6.
6. **Troisième rôle PostgreSQL, `pomme_auth`**, pour Better Auth. Les tables de connexion
   (`session`, `account`, `verification`, `passkey`) n'ont de politique RLS que pour lui : le
   rôle de l'application (`pomme_app`) ne peut pas lire un jeton de session, même par erreur.
   Better Auth peut aussi lire `user` sans contexte d'AMAP, pour retrouver un compte par email.
7. **Emails** par SMTP : Mailpit en local (http://localhost:8025), relais SMTP de Brevo en
   production (fiche S5, avec le journal des envois et les modèles aux couleurs de l'AMAP).

## Pourquoi

- Le lien magique repose sur la boîte email, déjà protégée par la plupart des gens ; la
  passkey est résistante à l'hameçonnage et plus rapide au quotidien.
- Better Auth est maintenu, typé, fonctionne avec Drizzle et Next.js, et couvre les trois
  besoins (lien, passkey, 2FA) sans service tiers.
- Isoler les jetons dans un rôle dédié limite les dégâts d'une faille dans le reste du code.

## Conséquences

- Le modèle de données est adapté aux noms attendus par Better Auth : `user.email_verified`
  (booléen, au lieu de `email_verified_at`), `user.image`, et les quatre tables de connexion.
  Better Auth reçoit le prénom comme « name ».
- `pnpm db:setup` crée deux rôles (`pomme_app`, `pomme_auth`) ; variables `DATABASE_AUTH_URL`,
  `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `SMTP_URL`, `EMAIL_FROM`.
- Better Auth ne demande la deuxième vérification qu'après une connexion par mot de passe :
  pour les administrateurs connectés par lien magique, Pomme l'imposera elle-même (partie 2).
- La limitation en mémoire devra passer en base si l'application tourne sur plusieurs instances.
