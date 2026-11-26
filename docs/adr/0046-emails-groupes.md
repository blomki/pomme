# 0046. Emails groupés et historique des envois

- Statut : accepté
- Date : 2026-11-26

## Contexte

Story H1 : un admin écrit à tous les adhérents ou aux clients d'un producteur, avec des balises
remplacées pour chaque destinataire (`{{prenom}}`, dates de la période de commande et des
disponibilités, `{{producteur}}`), et consulte l'historique de tous les envois, **emails
automatiques compris**, avec leur auteur (toujours une personne) et les adresses en échec.

## Décision

1. **Table `email_campaign`** (modèle de données, section 9) : une ligne par envoi groupé
   (audience, producteur, objet, message, auteur, automatique, nombre de destinataires et de
   foyers). **`notification_log.campaign_id`** relie chaque email à son envoi : l'historique en
   tire « Tout distribué » ou « N adresses en échec » (échec ou limite de débit).
2. **Un seul chemin d'envoi groupé** (`server/email/campaigns.ts`, `sendCampaign`) : il inscrit
   l'envoi, puis envoie chaque email dans sa propre transaction. Il sert à l'écran « Emails » et
   aux envois existants : relances des foyers sans commande (D2, D5), ouverture et relance des
   disponibilités (G1), envoi et changements du planning (G2).
3. **Auteur** : l'admin qui envoie ; pour un envoi automatique, la personne qui a créé la
   période ou le planning (« · automatique »).
4. **Balises** (`domain/email-tags.ts`, fonctions pures, partagées par l'aperçu du navigateur et
   l'envoi) : une balise inconnue donne un avertissement et reste telle quelle ; une période non
   définie ou `{{producteur}}` hors envoi aux clients d'un producteur **bloquent** l'envoi (sinon
   des balises brutes partiraient). Les destinataires et les valeurs sont **recalculés au moment
   de l'envoi**, jamais repris du navigateur.
5. **Destinataires** : un email par personne (pas par foyer). Tous les adhérents = membres des
   foyers dont l'adhésion couvre aujourd'hui ; clients d'un producteur = membres des foyers qui
   lui ont commandé pour le mois en cours, les 3 mois précédents ou le mois suivant (commandes
   passées ce mois-ci).
6. **Modèles** (message libre, ouverture des commandes, ouverture et relance des
   disponibilités, information d'un producteur) : textes fixes dans `fr.json`, lus tels quels
   (`t.raw`, sans interprétation des accolades). Choisir un modèle remplace l'objet et le message.
7. **Premiers éléments de la charte** (#115) : `PageBanner` (bandeau illustré, image de l'AMAP
   décorative : son logo s'il existe) et `StepCard` (carte d'étape numérotée), composants
   partagés à reprendre sur les autres écrans.

## Pourquoi

- **Un historique commun** plutôt qu'un historique par fonctionnalité : l'admin voit au même
  endroit tout ce que l'AMAP a envoyé, et les échecs.
- **Écriture sans RETURNING** : les tâches automatiques ont le droit d'écrire l'historique, pas
  de le lire (réservé aux admins) ; l'identifiant de l'envoi est donc donné par l'application.
- **Blocage plutôt qu'avertissement** pour les balises impossibles à remplir : un email parti
  avec « {{finPeriodeCommande}} » ne se rattrape pas.

## Conséquences

- La capture visuelle de l'écran utilise une page de démonstration aux données fixes
  (`/plateforme/demo/emails`), comme la feuille d'émargement : l'historique réel change chaque
  jour.
- Les envois antérieurs à cette fiche ne figurent pas dans l'historique.
