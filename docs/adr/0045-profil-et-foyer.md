# 0045. Profil, foyer et invitations des membres

- Statut : accepté
- Date : 2026-11-26

## Contexte

Story A3 : chaque amapien gère son profil (prénom, nom, téléphone), les membres de son foyer
(inviter, annuler une invitation, retirer), ses passkeys et ses appareils, et choisit son mode
(consomm'acteur, référent, administrateur) quand il a plusieurs rôles. Jusqu'ici, seuls les
admins pouvaient ajouter une personne à un foyer, et elle y était rattachée **tout de suite**,
sans rien accepter. Le wireframe de A3 prévoit au contraire qu'une personne invitée « reçoit un
lien pour rejoindre le foyer », valable 7 jours.

## Décision

1. **Deux pages** : « Mon profil » (`/compte` : mode, mes informations, mon foyer, mes espaces)
   et « Connexion et sécurité » (`/compte/securite` : passkeys avec date de dernière utilisation,
   application d'authentification, déconnexion de cet appareil ou de tous, avec confirmation).
2. **Invitation avec acceptation** : table `household_invitation` (email, empreinte SHA-256 du
   jeton, expiration à 7 jours, acceptée, annulée). La personne invitée ne rejoint le foyer
   qu'en cliquant « Rejoindre le foyer » sur `/connexion/invitation?jeton=…`. Le lien n'arrive
   que dans sa boîte mail : le détenir prouve qu'elle contrôle l'adresse, comme un lien de
   connexion ; **pas besoin d'être connecté**. Le compte est créé vide à l'invitation (les liens
   de connexion ne créent pas de compte) ; la page demande alors le prénom.
3. **Gestes du foyer par des fonctions de base** (migration 0043), car un membre n'écrit pas dans
   `household_member` (réservé aux admins) :
   - `household_invitation_details` : ce que montre la page de l'invitation, pour qui détient
     le jeton ;
   - `accept_household_invitation` : lien valable, foyer actif, personne dans aucun autre foyer
     de l'AMAP ;
   - `remove_household_member` : même foyer, jamais soi-même ; le membre est archivé (compte
     conservé) ; s'il était contact principal, la personne qui le retire le devient.
4. **Retrait annoncé** : la personne retirée reçoit un email.
5. **Mode mémorisé sur le compte** (`user.preferred_space`, par exemple
   `hommesdeterre/referent`) : choisi dans « Mon profil » ou dans le sélecteur d'espace de
   l'en-tête, il ouvre l'espace après la connexion, s'il est toujours un espace du compte.
6. **Passkeys** : `passkey.last_used_at`, noté par un crochet de Better Auth à chaque connexion
   par passkey.

## Pourquoi

- **Acceptation plutôt que rattachement direct** : un membre de foyer ne doit pas pouvoir
  rattacher le compte de quelqu'un à son foyer sans son accord (la personne verrait une
  commande qui n'est pas la sienne, et son nom apparaîtrait dans ce foyer).
- **Sans connexion** : plus simple pour une personne qui découvre Pomme ; la sécurité est celle
  d'un lien de connexion (adresse prouvée, lien à usage unique, durée limitée).
- **Un clic sur la page** plutôt qu'un lien qui agit seul : certaines messageries ouvrent les
  liens pour les analyser.
- **Fonctions de base** plutôt que d'ouvrir l'écriture de `household_member` aux membres : les
  conditions sont vérifiées au même endroit que les données, sans élargir la Row Level Security.
- **Mode sur le compte** plutôt que dans un cookie : il suit la personne d'un appareil à
  l'autre.

## Conséquences

- L'invitation par un admin (« Inviter un foyer », A2) reste un rattachement direct : l'admin
  connaît les membres de son AMAP. Les deux chemins coexistent.
- Une invitation jamais acceptée laisse un compte vide sans foyer, sans effet.
- La correction de l'email de connexion reste réservée aux admins (A1).
