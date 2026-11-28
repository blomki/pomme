# 0041. Connexion renforcée : référents, alerte de nouvel appareil, réinitialisation

- Statut : accepté
- Date : 2026-11-22

## Contexte

Pomme n'a pas de mot de passe (ADR 0005) : qui contrôle la boîte mail d'une personne peut
demander un lien de connexion à sa place. Pour les admins, une deuxième vérification
(application d'authentification ou passkey) ferme déjà cette porte (story A1). La story S10
étend cette protection :

- les référents voient et modifient des chèques et des commandes : ils doivent aussi avoir une
  deuxième vérification ;
- chacun doit savoir quand son compte est ouvert depuis un appareil inconnu ;
- quelqu'un qui perd son téléphone doit pouvoir retrouver l'accès, sans que l'email suffise.

## Décision

1. **Référents** : `SECOND_FACTOR_ROLES` contient `admin` et `referent`. Les pages du référent
   vérifient d'abord le rôle (sinon page 404), puis la deuxième vérification ; `requireRole` la
   redemande dans chaque action.
2. **Appareils connus** : un cookie `pomme_appareil` (aléatoire, 400 jours, `httpOnly`) est posé
   par `proxy.ts`. À chaque connexion, on note son **empreinte** (SHA-256) dans `known_device`.
   Un appareil inconnu, alors que le compte en a déjà un, déclenche un email d'alerte. Le premier
   appareil n'alerte pas.
3. **Lien « Déconnecter tous mes appareils »** dans l'email : un jeton signé (HMAC-SHA256 avec
   `BETTER_AUTH_SECRET`), valable 7 jours, qui ne permet **que** de fermer les sessions du compte.
   La page demande une confirmation avant d'agir.
4. **Réinitialisation de la deuxième vérification** : jamais par email. Un **autre** admin de
   l'AMAP le fait depuis la fiche du foyer (bouton visible pour les admins et référents), après
   avoir reconnu la personne. L'application d'authentification et les passkeys sont retirées,
   les sessions fermées, et l'action est inscrite au journal (`reset_second_factor`).

## Pourquoi

- **Empreinte plutôt que cookie en base** : si la base fuitait, les empreintes ne permettraient
  pas de se faire passer pour un appareil connu.
- **Pas d'alerte au premier appareil** : sinon chaque nouveau compte recevrait une alerte inutile
  et les gens apprendraient à les ignorer.
- **Confirmation avant de déconnecter** : certaines messageries ouvrent les liens pour les
  analyser ; un lien qui agirait seul déconnecterait la personne sans qu'elle l'ait voulu.
- **Le jeton ne donne aucun accès** : volé, il permet au pire de déconnecter la personne, ce
  qui est sans danger.
- **Pas pour soi-même** : la réinitialisation sert justement quand on ne peut plus prouver
  qui l'on est. Un autre admin, qui reconnaît la personne, apporte ce contrôle humain.
- **Écarté : réinitialiser par un code envoyé par email** : c'est exactement la faille que la
  deuxième vérification ferme.

## Conséquences

- Une AMAP doit avoir au moins deux admins pour qu'un admin bloqué retrouve l'accès sans aide.
- **Réinitialisation par le gestionnaire de la plateforme** : faite par la story S10b, voir
  l'ADR 0047 (journal de la plateforme, recherche d'un compte par email).
- Les référents de démonstration : `referent.demo` a l'application de démonstration ;
  `referent2.demo` n'a aucun moyen de vérification (test de l'invitation à en activer un).
- Un cookie effacé fait passer l'appareil pour nouveau : une alerte de plus, sans gravité.

## Mise à jour (fiche #125) : bouton affiché seulement s'il y a quelque chose à réinitialiser

- Sur la fiche d'un foyer, « Réinitialiser la deuxième vérification » n'apparaît que pour un
  admin ou un référent qui a une application d'authentification ou une passkey, jamais sur sa
  propre ligne (règle `canResetMemberSecondFactor`, `src/domain/second-factor.ts`). Après la
  réinitialisation, le bouton disparaît de la ligne sans recharger la page.
- La table `passkey` reste réservée à Better Auth (ADR 0005). La fonction
  `amap_members_with_second_factor` (migration 0048, `SECURITY DEFINER`, comme
  `find_user_id_by_email`) répond à sa place par un simple « oui » : réservée aux admins de
  l'AMAP courante, limitée aux personnes de cette AMAP, sans aucun autre détail.
- Même logique sur `/plateforme/comptes` (ADR 0047) : pas de bouton pour un compte sans moyen de
  vérification (l'information y était déjà).
