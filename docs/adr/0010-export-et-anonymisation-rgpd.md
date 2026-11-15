# 0010. Export et anonymisation des données d'un foyer (RGPD)

- Statut : accepté
- Date : 2026-11-15

## Contexte

Le cahier des charges demande l'export et l'anonymisation des données d'un foyer, sur sa
demande (droits d'accès, de portabilité et d'effacement). Le modèle de données interdit toute
suppression, « seule exception, la suppression RGPD d'un foyer, qui anonymise ». Deux
difficultés :

- le compte Pomme est unique : un membre du foyer peut être inscrit dans une autre AMAP ;
- le journal (`audit_log`) peut contenir des données personnelles (ancienne et nouvelle
  adresse d'une correction d'email), et l'application ne peut jamais le modifier.

## Décision

1. **Export** : un fichier JSON téléchargé depuis la fiche du foyer
   (`/<amap>/admin/foyers/<id>/export`), réservé aux admins après la deuxième vérification.
   Il contient le foyer, ses membres (profil, contact principal, statut, rôles), les emails
   envoyés et l'historique du foyer. L'export est inscrit au journal. **Chaque nouvelle donnée
   d'un foyer (adhésions, commandes, chèques, avoirs…) devra y être ajoutée**
   (`exportHousehold`, `src/server/households.ts`).
2. **Anonymisation**, irréversible, confirmée en retapant le nom du foyer, faite par une
   fonction de base `anonymize_household` (`SECURITY DEFINER`, migration 0009) en une
   transaction :
   - rôles des membres dans cette AMAP retirés ;
   - journal de cette AMAP : les lignes restent (qui, quoi, quand), leurs valeurs concernant le
     foyer et ses membres deviennent `{"anonymise": true}` ;
   - foyer renommé « Foyer anonymisé xxxxxxxx », archivé, marqué `anonymized_at` ; les liens
     entre le foyer et ses membres sont **supprimés** ;
   - compte de chaque membre qui n'est plus actif dans aucune AMAP (et n'est pas gestionnaire)
     anonymisé : nom, email (`anonyme-<id>@anonyme.invalid`), téléphone effacés. Un compte
     encore actif dans une autre AMAP est gardé tel quel.
3. Pour les comptes anonymisés, l'application fait ensuite effacer par Better Auth (seul
   autorisé sur ses tables, ADR 0005) sessions, connexions, passkeys et application
   d'authentification.

## Pourquoi

- JSON : lisible par une machine (portabilité), simple à tenir à jour.
- Fonction de base : il faut voir les autres AMAP et modifier le journal, deux choses
  interdites à l'application ; la fonction ne le permet que pour ce cas, pour un admin, et
  pour un foyer de son AMAP.
- Garder le compte d'une personne active ailleurs : une AMAP ne décide pas pour une autre.
- Supprimer les liens foyer–membres : sinon la Row Level Security laisserait l'AMAP voir
  encore les coordonnées d'un membre gardé pour une autre AMAP. Les données d'un foyer qui
  doivent rester (commandes, chèques : obligations comptables) seront rattachées au foyer,
  pas aux personnes.
- Retaper le nom : une anonymisation par erreur ne se rattrape pas.

## Conséquences

- Les montants financiers restent (avec le foyer anonymisé) quand les commandes et les chèques
  arriveront : à vérifier dans chaque fiche qui ajoute une donnée liée à un foyer.
- La story C1 (producteurs) devra compléter la fonction : un compte lié à un producteur reste
  actif.
- Un ancien lien de connexion envoyé à l'adresse effacée ne peut pas recréer de compte : la
  création de compte par lien est désactivée (`disableSignUp`).
