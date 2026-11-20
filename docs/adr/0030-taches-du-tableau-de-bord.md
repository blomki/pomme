# 0030. Liste de tâches du tableau de bord admin

- Statut : accepté
- Date : 2026-11-20

## Contexte

Le tableau de bord admin (story H3, écran A1) montre « Votre liste de tâches ». Deux sortes de
tâches :

- **« Bloquant »** : un problème que l'application détecte elle-même (producteur sans référent,
  catalogue pas publié trois jours avant l'ouverture des commandes, signalement pas traité). Il
  disparaît dès qu'il est réglé.
- **« À suivre »** : un rappel que l'admin coche à la main.

Le modèle de données prévoit une table `admin_task`, avec une seule tâche par sujet.

## Décision

1. **Tâches « Bloquant » calculées à l'affichage**, jamais enregistrées (déjà en place depuis C1,
   C3 et F5) : rien à cocher, rien à nettoyer.
2. **Tâches « À suivre » enregistrées** dans `admin_task`, créées par l'application au moment où
   quelque chose est à faire, dans la même transaction que l'action qui les déclenche :
   - **distribution fermée** (vacances, jour férié) : vérifier que les familles et les
     producteurs sont prévenus. Échéance : le jour de la distribution. Rouverte, la tâche est
     archivée ;
   - **signalement reporté de la feuille d'émargement** par un admin : en parler au producteur.
3. **Pas de doublon** : unicité sur (AMAP, sorte, sujet). Refermer une distribution remet sa
   tâche à faire au lieu d'en créer une seconde.
4. **Texte composé à l'affichage**, en français (`fr.json`), à partir des valeurs gardées dans
   `details` (date, motif, produit…) : aucun texte d'interface dans la base.
5. **« Marquer comme fait »** enregistre qui et quand ; « Annuler » (message de confirmation) et
   « Rétablir » (section repliable « Tâches terminées », 20 dernières) la remettent à faire.
6. **Réservé aux admins** : `requireRole` et Row Level Security (lecture et écriture). Jamais
   supprimée : archivée.
7. **Avancement** : le bandeau des commandes montre déjà « N foyers sur M ont commandé » (D2) ;
   une carte « Adhésions » ajoute les foyers adhérents et les adhésions qui expirent bientôt.

## Pourquoi

- Calculer les tâches « Bloquant » évite qu'une tâche reste affichée alors que le problème est
  réglé.
- Créer les tâches « À suivre » dans la transaction de l'action garantit qu'aucune n'est oubliée,
  ni créée pour une action annulée.

## Conséquences

- La tâche « Bloquant » « distribution sans 3 bénévoles » viendra avec le planning des
  permanences (G1, G2) : il n'existe pas encore d'inscription des bénévoles.
- Ajouter une sorte de tâche « À suivre » : une valeur dans `ADMIN_TASK_KINDS`
  (`domain/admin-tasks.ts`, migration de l'enum), son texte dans `fr.json`, et l'appel à
  `addFollowUpTask` dans l'action qui la déclenche.
