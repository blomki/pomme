# Registre des traitements de l'AMAP [nom de l'AMAP]

Modèle à tenir par l'AMAP (article 30 du RGPD). Une association de moins de 250 personnes peut
tenir un registre simplifié ; celui-ci suit le modèle de la CNIL, en langage simple.

- **Responsable de traitement** : AMAP [nom], association loi 1901, [adresse du siège],
  représentée par [fonction : président·e, co-président·es]. Contact : [adresse email de
  contact de l'AMAP].
- **Sous-traitant** : le gestionnaire de la plateforme Pomme, [à compléter : nom, adresse,
  contact], qui héberge les données et fait fonctionner l'application.
- **Mise à jour** : [date].

Pour chaque traitement : à quoi il sert (finalité), ce qui l'autorise (base légale), qui est
concerné, quelles données, qui les voit, combien de temps on les garde.

---

## 1. Gestion des adhérents et des foyers

- **Finalité** : tenir la liste des foyers adhérents, de leurs membres et de leurs adhésions ;
  inviter les membres ; donner les rôles (référent, admin).
- **Base légale** : contrat d'adhésion à l'association.
- **Personnes** : membres des foyers adhérents.
- **Données** : nom, prénom, adresse email, téléphone (facultatif), foyer, dates d'adhésion,
  rôles dans l'AMAP.
- **Qui les voit** : les admins et les référents de l'AMAP ; chaque membre voit son foyer.
  Les coordonnées d'un référent et du producteur sont visibles des familles qui commandent
  chez ce producteur.
- **Conservation** : pendant l'adhésion, puis [à décider : par exemple 3 ans après la fin de
  la dernière adhésion], avant anonymisation. Anonymisation immédiate sur demande.

## 2. Demandes d'adhésion (« Nous rejoindre »)

- **Finalité** : recevoir les demandes des personnes qui veulent adhérer et les recontacter.
- **Base légale** : mesures précontractuelles, à la demande de la personne.
- **Personnes** : visiteurs du site qui remplissent le formulaire.
- **Données** : nom, prénom, adresse email, téléphone, message libre.
- **Qui les voit** : les admins de l'AMAP.
- **Conservation** : demande acceptée : rattachée au foyer créé. Demande refusée ou sans suite :
  [à décider : par exemple 1 an], puis suppression.

## 3. Commandes, chèques et avoirs

- **Finalité** : prendre les commandes mensuelles, préparer les bons de commande des
  producteurs, suivre la remise et l'encaissement des chèques, accorder des avoirs.
- **Base légale** : contrat (engagement auprès des producteurs) ; obligation de tenir une
  comptabilité.
- **Personnes** : membres des foyers ; producteurs.
- **Données** : produits et quantités commandés, montants, numéros et montants des chèques,
  état (reçu, remis, écart), avoirs et signalements. **Aucune coordonnée bancaire.**
- **Qui les voit** : le foyer concerné ; les référents des producteurs concernés ; les admins ;
  chaque producteur voit les commandes qui le concernent.
- **Conservation** : [à décider : 10 ans pour les pièces comptables, ou durée retenue par le
  bureau], rattachées au foyer, y compris s'il est anonymisé.

## 4. Permanences et distributions

- **Finalité** : connaître les indisponibilités, établir le planning des permanences,
  imprimer la feuille d'émargement.
- **Base légale** : contrat d'adhésion (participation aux permanences prévue par les statuts ou
  le règlement de l'AMAP).
- **Personnes** : membres des foyers.
- **Données** : indisponibilités déclarées, permanences attribuées, nombre de permanences
  faites ; nom et téléphone des bénévoles imprimés sur la feuille d'émargement.
- **Qui les voit** : les admins ; chaque membre voit ses propres réponses et le calendrier ;
  la feuille imprimée est visible des bénévoles de la distribution.
- **Conservation** : [à décider : par exemple 2 ans], le nombre de permanences servant au
  planning suivant.

## 5. Communication par email

- **Finalité** : envoyer les emails de service (invitations, liens de connexion, confirmations
  de commande, rappels) et les emails groupés de l'AMAP à ses adhérents.
- **Base légale** : contrat d'adhésion ; intérêt légitime pour les emails groupés liés à la
  vie de l'AMAP.
- **Personnes** : membres des foyers ; producteurs.
- **Données** : adresse email, prénom, objet et contenu de l'email, date et résultat de l'envoi.
- **Qui les voit** : les admins (historique des envois) ; le prestataire d'envoi (Brevo).
- **Conservation** : historique des envois [à décider : par exemple 2 ans].

## 6. Producteurs

- **Finalité** : présenter les producteurs, gérer leurs catalogues et leur accès à leur espace.
- **Base légale** : contrat avec le producteur.
- **Personnes** : producteurs et leurs contacts.
- **Données** : nom de la ferme, description, photo, ordre des chèques, compte du producteur
  (nom, adresse email, téléphone).
- **Qui les voit** : public pour la présentation de la ferme (site de l'AMAP) ; adhérents et
  admins pour le reste.
- **Conservation** : pendant la relation avec le producteur, puis [à décider].

## 7. Sécurité des comptes et journal des actions

- **Finalité** : protéger les comptes (connexion, deuxième vérification, alerte de nouvel
  appareil), empêcher les abus (limitation des tentatives, captcha), garder la trace des
  actions sensibles (corrections, actions sur les chèques et les avoirs).
- **Base légale** : intérêt légitime (sécurité) ; obligation de sécurité (article 32 du RGPD).
- **Personnes** : toute personne qui se connecte ou remplit un formulaire.
- **Données** : sessions (appareil, adresse IP), empreinte des appareils connus (un code
  chiffré, pas d'information sur l'appareil lui-même), moyens de deuxième vérification, journal
  des actions (qui, quoi, quand, avant et après).
- **Qui les voit** : les admins pour le journal de leur AMAP ; personne d'autre.
- **Conservation** : session : 30 jours sans activité. Cookie d'appareil connu : 400 jours.
  Journaux du serveur : 7 jours. Journal des actions : [à décider], ses valeurs étant
  anonymisées avec le foyer.

---

## Sous-traitants ultérieurs (prestataires techniques)

Tous sont établis dans l'Union européenne et y traitent les données.

| Prestataire      | Rôle                                                      | Lieu des données |
| ---------------- | --------------------------------------------------------- | ---------------- |
| Clever Cloud     | Hébergement de l'application, de la base et des fichiers  | France           |
| Scaleway         | Copie de sauvegarde chiffrée (stockage seul)              | France (Paris)   |
| Brevo            | Envoi des emails                                          | France           |
| Friendly Captcha | Protection des formulaires contre les robots, sans cookie | Allemagne / UE   |
| Sentry           | Supervision des erreurs, sans donnée personnelle          | UE (Allemagne)   |
| GitHub           | Code source de l'application, sans donnée des AMAP        | —                |

## Sauvegardes

Copie quotidienne de la base chez Clever Cloud (7 jours) ; copie chiffrée chez Scaleway, non
effaçable : 30 copies quotidiennes et 12 copies mensuelles (un an). Une donnée effacée ou
anonymisée disparaît donc des sauvegardes au bout d'un an au plus.

## Mesures de sécurité

Connexion sans mot de passe, deuxième vérification pour les admins et les référents ;
isolation des AMAP dans la base ; chiffrement des échanges (HTTPS) ; sauvegardes chiffrées,
dont la clé est gardée hors ligne ; images déposées ré-encodées (métadonnées comme la position
GPS supprimées) ; journal des actions sensibles.
