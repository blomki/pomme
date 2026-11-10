# 0005. Connexion sans mot de passe avec Better Auth

- Statut : accepté (partie 1 : lien magique, passkeys, sessions ; partie 2 : deuxième
  vérification, correction d'email)
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
7. **Deuxième vérification** (partie 2) pour les admins d'AMAP et les gestionnaires de la
   plateforme : passkey, ou code d'une application d'authentification (TOTP, plugin
   `twoFactor` sans mot de passe), ou code de secours (10, à usage unique, chiffrés).
   - Better Auth ne la demande qu'après un mot de passe : Pomme l'impose elle-même. La session
     porte `second_factor_verified_at`, rempli à l'ouverture par passkey, à l'activation de
     l'application, ou après un code juste (`/connexion/verification`).
   - Les espaces administration et plateforme y renvoient ; `requireRole` refuse une action
     réservée aux admins (`SecondFactorRequiredError`) si la session n'est pas vérifiée. Une
     action ouverte aussi aux référents ne l'exige pas.
   - Le **premier** moyen (passkey ou application) peut être créé juste après un lien magique,
     et la session compte alors comme vérifiée. Ensuite, ajouter ou retirer un moyen exige une
     session vérifiée (crochet `before` de Better Auth).
   - Codes saisis : 5 essais par compte et par quart d'heure (Better Auth ne limite pas les
     essais sur une session déjà ouverte).
8. **Correction de l'email** d'un membre par un admin de son AMAP (Administration › Membres) :
   journalisée (`audit_log`, avant / après), adresse marquée non vérifiée, sessions de la
   personne fermées. La RLS (`user_update_by_amap_admin`) limite la correction aux personnes
   qui ont un rôle dans l'AMAP courante, et l'interdit sur le compte d'un gestionnaire.
9. **Emails** par SMTP : Mailpit en local (http://localhost:8025), relais SMTP de Brevo en
   production ; journal des envois et gabarit commun : voir ADR 0006.

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
  pour les administrateurs connectés par lien magique, Pomme l'impose elle-même (point 7).
- Risque accepté : tant qu'un admin n'a aucun moyen de vérification, quelqu'un qui aurait volé
  l'accès à sa boîte email pourrait enregistrer le sien. Il ne peut plus le faire une fois le
  premier moyen créé.
- Un même compte peut appartenir à plusieurs AMAP : l'admin de l'une peut corriger l'email
  d'une personne qui est aussi admin ailleurs. La deuxième vérification protège ce compte
  (le nouvel email ne suffit pas pour agir en admin), et la correction est journalisée.
  La RLS ne peut pas limiter les colonnes modifiées : l'action ne change que l'email.
- Le rôle `pomme_auth` lit `amap_role` (lecture seule) pour savoir qui est admin.
- Comptes de démonstration : `admin.demo` et `gestionnaire.demo` ont l'application activée avec
  une clé publique (README) ; `admin2.demo` n'a aucun moyen, pour tester sa création.
- La limitation en mémoire devra passer en base si l'application tourne sur plusieurs instances.
