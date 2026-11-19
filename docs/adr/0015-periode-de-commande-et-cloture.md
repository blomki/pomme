# 0015. Période de commande : jours, tâche horaire et clôture

- Statut : accepté
- Date : 2026-11-18

## Contexte

Story D2 : l'admin fixe les dates d'ouverture et de clôture des commandes du mois, relance les
familles, peut clôturer à la main et rouvrir après la clôture. La clôture calcule les chèques
attendus, avoirs déduits (modèle de données, sections 6 et 7). Plusieurs points restaient à
préciser, tranchés par le porteur du projet le 2026-11-18, ou découlant de décisions
antérieures.

## Décision

1. **Des jours, pas des heures.** L'admin choisit un jour d'ouverture et un jour de clôture :
   ouverture à 0 h, clôture à minuit à la fin du jour choisi, heure de Paris. Dates proposées :
   du 15 au 25 du mois d'avant (commandes de décembre en novembre).
2. **Une seule période par mois et par AMAP** (`order_period`), retrouvée par son mois, comme
   les distributions et les catalogues (ADR 0012).
3. **Tâche planifiée une fois par heure** (`clevercloud/cron.json`, `pnpm jobs:hourly`) : ouvre
   les périodes dont le jour est arrivé, clôture celles dont le jour est passé. Entre deux
   passages, **l'heure fait foi** : l'état affiché et les contrôles se calculent à partir des
   dates (`effectiveStatus`), une commande est donc refusée dès minuit.
4. **Prix gardé à la commande, pas figé à la clôture** (décision du 2026-11-15, ADR 0012) :
   `order_line.unit_price_cents` est rempli à la saisie (D3). La clôture ne fige plus de prix :
   elle calcule les chèques.
5. **Clôture en une transaction** : un chèque par foyer et par producteur commandé, total
   commandé moins les avoirs en attente, jamais négatif. Un avoir plus grand que la commande est
   déduit en partie : le reste devient un nouvel avoir en attente (`split_from_credit_id`).
6. **Réouverture jusqu'à un nouveau jour de clôture**, choisi par l'admin. La clôture suivante
   recalcule les chèques encore attendus (avoirs détachés puis déduits de nouveau) ; un chèque
   pointé ne bouge plus ; un chèque attendu qui n'a plus de commande est archivé.
7. **Relance : une par personne et par mois.** Les membres des foyers actifs sans commande
   reçoivent un email ; la clé de dédoublonnage du journal des emails refuse une deuxième
   relance pour la même période.
8. Tables créées dès D2, sans écran de saisie : `order` et `order_line` (saisie : D3),
   `cheque` (pointage : F1, remise : F3), `credit` (création : F2). Sans elles, la clôture
   n'aurait rien à calculer.

## Pourquoi

- Des jours suffisent aux familles (« jusqu'au 25 inclus ») et évitent toute ambiguïté d'heure
  à la saisie comme à l'affichage.
- Une fois par heure suffit : les familles voient l'état exact grâce au calcul par l'heure, et
  personne n'attend les chèques dans la minute qui suit minuit. La tâche passe à la 5e minute
  de chaque heure (UTC), donc peu après minuit à Paris.
- Clever Cloud lance la tâche sur chaque instance, et deux fois pendant un déploiement : la
  période est verrouillée (`SELECT … FOR UPDATE`) et son état revérifié, la clôture ne
  s'exécute qu'une fois. Le script ne tourne que sur l'instance 0.
- La tâche passe par le rôle de l'application et la Row Level Security, AMAP par AMAP, comme
  les pages : aucun accès privilégié. Le journal note une action automatique (acteur vide).
- Partager un avoir plutôt que l'ignorer : un avoir de 10 € face à une commande de 6 € serait
  sinon reporté indéfiniment.

## Conséquences

- Il faut une date pour rouvrir : l'ancienne est passée, la tâche horaire reclôturerait
  aussitôt.
- La saisie des commandes (D3) devra : refuser une commande hors période ouverte (calcul par
  l'heure), garder le prix du catalogue au moment de la commande, verrouiller les commandes dont
  le chèque est pointé et les lignes des distributions passées, et vérifier la disponibilité
  côté serveur. Une clé étrangère vers `catalog_item_availability` aurait bloqué la
  modification du catalogue après les premières commandes : elle n'est pas posée.
- Qui voit quelle commande (famille, référent, producteur) : politiques par foyer posées par
  S12 (ADR 0021). La tâche horaire y accède par l'accès de confiance « closing_job ».
- Le bandeau du tableau de bord montre la période ouverte s'il y en a une, sinon celle du mois
  prochain. Rouvrir le mois en cours, une fois le mois suivant commencé, n'est pas prévu.
