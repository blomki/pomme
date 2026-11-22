# 0038. Rappel automatique avant la clôture

- Statut : accepté
- Date : 2026-11-21

## Contexte

Des familles oublient de commander avant la clôture. L'admin peut déjà relancer à la main
(« Relancer », story D2) ; la story D5 demande un rappel automatique, sans jamais envoyer deux
fois le même.

## Décision

1. **Réglage par AMAP** « Rappel avant la clôture (jours) », dans les réglages (A4) : 2 jours
   par défaut (le délai de la maquette du tableau de bord), de 0 à 14 ; 0 désactive le rappel.
2. **Envoi par la tâche horaire** existante (`pnpm jobs:hourly`, ADR 0015) : à partir de N jours
   avant le jour de clôture et jusqu'à ce jour (`reminderDue`, `domain/order-periods.ts`), un
   email à chaque membre des foyers actifs sans commande pour la période ouverte.
3. **Jamais deux fois** : même clé de dédoublonnage que « Relancer »
   (`order_reminder:<personne>:<période>`, journal des emails, ADR de S5). Une famille relancée
   à la main ne reçoit pas le rappel automatique, et inversement ; les passages horaires
   suivants ne renvoient rien.
4. **Même email et même liste** que « Relancer » : `reminderNotification` et
   `reminderRecipients` sont partagés.

## Pourquoi

- Réutiliser la tâche horaire évite un nouveau réglage chez l'hébergeur ; une fenêtre de
  plusieurs jours (plutôt qu'un jour précis) rattrape une heure où la tâche n'aurait pas tourné.
- Une clé de dédoublonnage commune garantit « une seule relance par personne et par période »,
  quelle que soit son origine.

## Conséquences

- La tâche horaire lit les foyers et leurs membres avec l'accès de confiance « closing_job »
  (S12, S13), comme pour la clôture.
- Un foyer qui commande après le rappel ne reçoit plus rien ; un foyer qui n'a pas reçu le
  rappel (adresse invalide, envoi en échec) peut être relancé à la main.
