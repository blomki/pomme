# 0007. Captcha des formulaires publics : Friendly Captcha

- Statut : accepté
- Date : 2026-11-10

## Contexte

Deux formulaires sont ouverts à tous : la connexion (demande d'un lien par email) et, avec la
story B2, « Nous rejoindre ». Un robot pourrait s'en servir pour envoyer des emails en masse
(et nuire à la réputation de l'expéditeur), ou pour épuiser le quota de liens d'une vraie
personne. Le cahier technique (section 5) retient Friendly Captcha : entreprise allemande,
traitement dans l'UE, sans cookie ni pistage, adresses IP hachées, données réservées à la
sécurité, et aucun puzzle à résoudre.

## Décision

1. **Friendly Captcha v2**, avec son kit officiel (`@friendlycaptcha/sdk`) dans un composant
   réutilisable `Captcha` (`src/ui/forms/Captcha.tsx`). Le widget se lance dès qu'on commence
   à remplir le formulaire et place sa réponse dans le champ caché `frc-captcha-response`.
2. **Vérification côté serveur** (`src/server/captcha.ts`), avant tout traitement :
   - réponse absente ou refusée : la demande est refusée, avec un message clair (« La
     vérification anti-robot n'est pas terminée… ») dans une zone annoncée par les lecteurs
     d'écran ;
   - **Friendly Captcha en panne ou injoignable : la demande est acceptée** et l'incident
     journalisé, comme le conseille l'éditeur. Les limites de débit restent en place.
3. **Le captcha passe avant les limites de débit** : un robot ne peut pas entamer le quota de
   liens d'une vraie personne.
4. **Configuration** : `FRIENDLY_CAPTCHA_SITEKEY`, `FRIENDLY_CAPTCHA_API_KEY`,
   `FRIENDLY_CAPTCHA_ENDPOINT` (`eu` ou `global`). Sans clés, le captcha est désactivé en
   développement ; en production, l'application refuse de servir les formulaires.
   `CAPTCHA_DISABLED=1` ne sert qu'à la CI (build de production sans clés).

## Pourquoi

- Pas de puzzle d'images : accessible (RGAA), et rien à faire pour les familles.
- Pas de cookie : pas de bandeau de consentement à ajouter pour lui.
- Accepter en cas de panne : une panne chez un prestataire ne doit pas empêcher les familles
  de se connecter le jour de la clôture des commandes. Le risque (quelques demandes de robots
  pendant la panne) est contenu par les limites de débit.
- reCAPTCHA (Google) et hCaptcha écartés : pistage, ou puzzles peu accessibles.

## Conséquences

- **Avant la production** :
  - créer le compte Friendly Captcha, déclarer le domaine, régler les clés chez l'hébergeur ;
  - vérifier que l'offre choisie permet le point d'accès UE (`eu`). Sinon, le traitement passe
    par le point d'accès mondial : à trancher au regard du cahier technique ;
  - obtenir une **confirmation écrite** que les données ne servent pas à entraîner une IA
    (critère de l'issue #7).
- Une clé d'API fausse fait accepter toutes les demandes (comme une panne) : surveiller les
  journaux après le déploiement (« Friendly Captcha : réponse HTTP … »).
- Le widget charge un script et appelle les serveurs de Friendly Captcha : à autoriser le jour
  où une politique de sécurité du contenu (CSP) sera mise en place.
- « Nous rejoindre » (B2) réutilisera `Captcha` et `verifyCaptcha`, avec ses propres limites
  par IP et par email.
- Les tests de bout en bout tournent sans captcha (pas de clés en CI) : le widget est couvert
  par un test de composant, la vérification par des tests unitaires.
