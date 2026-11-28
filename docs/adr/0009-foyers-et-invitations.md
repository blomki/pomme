# 0009. Foyers, compte unique et invitations

- Statut : accepté
- Date : 2026-11-14

## Contexte

Story A2 : un administrateur crée un foyer, y ajoute des membres et les invite par email. Trois
contraintes :

- le compte est unique sur la plateforme : une personne déjà inscrite dans une autre AMAP garde
  son compte, et son nouveau foyer s'y rattache ;
- la Row Level Security (ADR 0003) cache à l'application les comptes qui n'appartiennent pas à
  l'AMAP courante : impossible de « voir » ce compte existant pour le rattacher ;
- un lien de connexion ne vaut que 15 minutes (ADR 0005), alors qu'une invitation peut être
  ouverte des jours plus tard.

## Décision

1. **Tables `household` et `household_member`**, toutes deux avec `amap_id` (le modèle de
   données ne le prévoyait pas sur `household_member`) : la RLS isole les AMAP sans jointure, et
   une clé étrangère composée garantit que le membre et son foyer sont dans la même AMAP.
   Contraintes en base : nom de foyer unique dans l'AMAP (sans tenir compte des majuscules,
   parmi les foyers non archivés) ; un seul foyer actif par personne et par AMAP ; un seul
   contact principal par foyer.
2. **Fonction `find_user_id_by_email`** (`SECURITY DEFINER`, migration 0007), comme l'ADR 0003
   l'avait prévu : réservée aux administrateurs de l'AMAP courante (vérifié par la base), elle
   ne renvoie que l'identifiant du compte. Le profil d'un compte existant (nom, téléphone)
   n'est jamais modifié par l'invitation : il appartient à la personne.
3. **L'invitation ne contient pas de lien de connexion.** C'est un email aux couleurs de
   l'AMAP dont le bouton mène à la page de connexion, adresse déjà remplie ; un clic y envoie
   un lien de connexion frais de 15 minutes. Aucun accès durable au compte ne dort dans une
   boîte mail.
4. **Statut « invité » ou « actif »** déduit de `user.email_verified` : vrai dès que la
   personne a ouvert un lien de connexion. Rien de plus à stocker.
5. **Rôles** (référent, administrateur) attribués personne par personne depuis la fiche du
   foyer, cumulables, chacun inscrit au journal (`audit_log`). On ne peut pas retirer le
   dernier administrateur d'une AMAP (vérifié sous verrou, pour deux retraits simultanés).
   Depuis la fiche #138, la fenêtre « Rôles » a une case « Administrateur » et une case
   « Référent : <producteur> » par producteur actif, enregistrées ensemble. Le rôle de référent
   se déduit des producteurs suivis : cocher un producteur le donne, décocher le dernier le
   retire, depuis la fiche du membre comme depuis celle du producteur (même table
   `referent_assignment`, même transaction). Décocher le dernier référent d'un producteur est
   permis, après un avertissement ; la tâche « Bloquant » prend le relais. Les affectations à un
   producteur inactif, absentes de la fenêtre, sont gardées.
6. **Archivage** du foyer et de ses membres (`archived_at`), jamais de suppression, avec
   « Annuler ». L'export et l'anonymisation RGPD feront l'objet d'une deuxième PR.

## Pourquoi

- Une fonction dédiée plutôt qu'une politique RLS plus large : une politique qui laisserait un
  admin lire les comptes de toutes les AMAP par leur email en dévoilerait beaucoup plus
  (nom, téléphone).
- Invitation sans lien de connexion : un lien valable plusieurs jours, transféré ou lu par
  quelqu'un d'autre, ouvrirait le compte. Le prix est un clic de plus pour la famille.
- Un foyer « Demandes d'adhésion » (onglet des wireframes) dépend du formulaire
  « Nous rejoindre » (B2) : il viendra avec lui.

## Conséquences

- Un administrateur peut savoir si une adresse a déjà un compte Pomme (rattachement au lieu
  d'une création). C'est le prix du compte unique ; la fonction ne dit rien d'autre.
- `drizzle-kit` ne sait pas décrire une fonction : la migration 0007 a été générée vide
  (`pnpm exec drizzle-kit generate --custom`) puis écrite à la main. C'est la seule exception
  à la règle « jamais de migration écrite à la main », à n'utiliser que pour ce que Drizzle ne
  sait pas exprimer.
- La story J1 (création d'une AMAP) devra créer le premier administrateur dans un foyer, pour
  qu'il apparaisse dans « Foyers et adhésions ».
- L'adresse email figure dans l'adresse de la page de connexion ouverte depuis l'invitation :
  elle peut apparaître dans les journaux d'accès de l'hébergeur.
