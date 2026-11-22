# 0042. Indisponibilités du trimestre

- Statut : accepté
- Date : 2026-11-22

## Contexte

Le planning des permanences est trimestriel ; chaque distribution reçoit 3 bénévoles (modèle
de données, section 8). Avant de le générer (story G2), il faut savoir quand chacun ne peut pas
venir. Règles validées le 2026-11-22 (story G1) :

- une réponse **par personne**, pas par foyer : chaque membre répond depuis son compte ;
- une **période de réponse** fixée par l'admin (ouverture, date limite) ; rien en dehors ;
- rien coché, ou pas de réponse à la date limite = **disponible partout** ;
- après la date limite, lecture seule.

## Décision

1. Trois tables, isolées par AMAP (Row Level Security) :
   - `duty_plan` : le planning d'un trimestre (`quarter_start`, premier jour de janvier, avril,
     juillet ou octobre), l'ouverture (`opens_at`), la date limite (`unavailability_deadline`),
     la relance automatique (`auto_reminder`), l'état (`collecting`, puis `draft` et `sent`
     avec G2), et les dates de l'email d'ouverture et de la dernière relance ;
   - `duty_response` : une ligne par personne et par planning, avec la date de réponse
     (`answered_at`) et de dernière relance (`last_reminded_at`) ;
   - `unavailability` : les distributions cochées « indisponible ».
2. Comme les périodes de commande (ADR 0015), l'admin choisit des **jours** : ouverture à 0 h,
   fin à minuit à la fin de la date limite, heure de Paris. Proposé par défaut : du 40e au 19e
   jour avant le trimestre (pour janvier : du 22 novembre au 13 décembre).
3. Les **amapiens** sont les membres des foyers actifs de l'AMAP.
4. Emails : l'**email d'ouverture** part une fois, par la tâche horaire, dès que la période est
   ouverte ; la **relance automatique** part 3 jours avant la date limite aux personnes sans
   réponse (désactivable) ; l'admin peut aussi **relancer** tout le monde ou une personne.
   Au plus une relance par personne et par jour, qu'elle vienne de l'admin ou de la tâche.
5. Écrans : « Mes disponibilités » (`/<amap>/famille/disponibilites`, écran 7) et sa carte
   « Permanences » sur l'accueil pendant la période ; « Disponibilités du trimestre »
   (`/<amap>/admin/planning/disponibilites`, écran A8), depuis « Planning des permanences ».

## Pourquoi

- **Une table des réponses en plus du modèle** : « je n'ai rien coché » et « je n'ai pas
  répondu » se ressemblent dans `unavailability` (aucune ligne). L'écran A8 doit pourtant les
  distinguer (« Disponible partout » ou « Sans réponse »), et noter la date de relance.
- **Dates remplacées à chaque envoi** (suppression puis ajout) : plus simple et sûr qu'un
  calcul de différences ; la personne envoie toujours sa liste complète.
- **Lecture des dates : soi-même et les admins.** Les autres amapiens n'ont pas à savoir qui
  est absent quand.
- **Une relance par jour au plus** : un double clic ou une relance manuelle le jour de la
  relance automatique n'envoie pas deux emails.
- **Écarté : déclarer par foyer.** Les bénévoles sont des personnes (leur nom et leur téléphone
  sont imprimés sur la feuille d'émargement).

## Conséquences

- Le jeu de données crée les distributions jusqu'à la fin du trimestre suivant, et une période
  de réponse ouverte avec 8 réponses (pas celles des comptes de démonstration).
- Le lien « Générer le planning » de l'écran A8 viendra avec l'éditeur du planning (G2, #40),
  qui lira `unavailability` et passera `duty_plan.status` à `draft`.
- Un empêchement après la date limite se règle entre bénévoles, ou par l'admin dans l'éditeur
  du planning (G2).
