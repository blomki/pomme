# 0034. Demandes d'adhésion

- Statut : accepté
- Date : 2026-11-21

## Contexte

Un visiteur du site public doit pouvoir demander à adhérer (story B2) ; les administrateurs
reprennent contact, puis créent le foyer et l'invitent. Le formulaire est ouvert à tous : il
attire les robots, et il recueille des données personnelles.

## Décision

1. **Formulaire `/<amap>/adherer`** (« Nous rejoindre ») : nom, email, téléphone et message
   facultatifs. Liens depuis le pied de page du site et l'accueil ; la page « Nous rejoindre »
   y renvoie. L'adresse `adherer` est réservée (pas de page du site à ce nom).
2. **Contre les robots**, dans cet ordre : captcha (Friendly Captcha, comme la connexion),
   puis limites de débit : 5 demandes par heure et par adresse IP, 3 par jour et par adresse
   email. Le captcha passe d'abord, pour qu'un robot ne puisse pas épuiser le quota d'une
   vraie personne.
3. **Table `join_request`** : un visiteur (sans compte) ne peut qu'**ajouter** une demande
   nouvelle, rattachée à rien (Row Level Security) ; lecture et suite réservées aux admins de
   l'AMAP.
4. **Onglet « Demandes d'adhésion »** de l'écran « Foyers et adhésions », avec le nombre à
   traiter : Écrire (lien `mailto:`), Appeler (lien `tel:`), Marquer comme contactée,
   Refuser (avec confirmation), Accepter.
5. **Accepter** crée, en une transaction, le foyer, son membre (le compte s'il n'existe pas) et
   l'adhésion (d'aujourd'hui à dans un an moins un jour, modifiable), puis rattache le foyer à
   la demande ; l'invitation part une fois la transaction validée, comme pour « Inviter un
   foyer » (A2). Une adhésion non valable n'enregistre rien.
6. **Journal** : contactée, refusée, acceptée.
7. **Données personnelles** : anonymiser un foyer (droit à l'effacement) efface aussi la
   demande qui l'a créé (nom, adresse, téléphone, message) et les valeurs de son journal.

## Pourquoi

- Une page à part plutôt qu'un formulaire glissé dans une page éditable : le formulaire ne
  dépend pas de ce que l'admin écrit, et son adresse reste stable.
- Les demandes restent dans la base (jamais supprimées) : l'historique montre qui a été
  contacté, et quand.

## Conséquences

- Les demandes refusées gardent les coordonnées de la personne : une purge après un délai
  (par exemple un an) sera à décider avec l'AMAP (durée de conservation RGPD).
- Pas d'email aux admins à chaque demande : le nombre à traiter s'affiche sur l'onglet. Un
  rappel pourra s'ajouter au tableau de bord.
