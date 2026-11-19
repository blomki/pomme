# 0023. Pointage des chèques

- Statut : accepté
- Date : 2026-11-19

## Contexte

À la clôture, Pomme calcule un chèque attendu par foyer et par producteur (ADR 0015). Le
référent reçoit ensuite les chèques à la distribution et doit savoir lesquels manquent, et si
un montant ne correspond pas (story F1). Le pointage verrouille la commande du foyer chez ce
producteur, même si l'admin rouvre les commandes (règle du 2026-11-04).

## Décision

1. **Écran « Pointage des chèques »** (`/referent/cheques`, et `/admin/cheques` pour l'admin),
   d'après la maquette R3 : titre « Chèques de novembre », résumé « Chèques traités pour N
   foyers sur M · n en attente · n écarts », filtres Tous / Non reçus / Écarts, un onglet par
   producteur, une ligne par foyer avec son statut (Reçu, Attendu, Écart, Remis).
2. **Cocher « Reçu » préremplit le montant attendu** ; le montant reste corrigeable, le numéro
   est facultatif. Clavier : Espace coche, Entrée enregistre la ligne et passe au foyer suivant.
   Chaque changement est enregistré aussitôt, avec « Annuler » dans le message de confirmation.
3. **Écart = reçu − attendu**, signalé tant que le référent ne l'a pas marqué « traité »
   (`cheque.gap_settled_at`, `gap_settled_by`). Un nouveau montant rouvre l'écart. Pomme ne dit
   pas comment le régler (complément, avoir…) : le référent en décide.
4. **Qui pointe** : le référent du producteur, ou un admin avec la deuxième vérification (règle
   commune `requireReferentOrAdmin`, comme D7 et S11). La Row Level Security (ADR 0021) le
   vérifie aussi : un autre référent ne voit même pas le chèque.
5. **Journal** : chaque pointage, correction, annulation et traitement d'écart (`audit_log`,
   type `cheque`) avec l'état avant et après.
6. **Un chèque remis au producteur** (statut `handed_over`, story F3) ne se modifie plus.
7. **Verrou de la commande** : déjà en place (D3 et clôture) ; un chèque reçu bloque les cases du
   foyer chez ce producteur, et la clôture suivante ne le recalcule pas.

## Pourquoi

- Préremplir le montant attendu rend le cas courant (chèque juste) rapide : Espace, Entrée.
- Un écart « traité » plutôt que résolu automatiquement : un complément peut arriver par un
  second chèque, en espèces, ou devenir un avoir (F2) ; seul le référent le sait.
- Annuler un pointage reste possible tant que le chèque n'est pas remis : une case cochée par
  erreur ne doit pas bloquer la commande d'une famille.

## Conséquences

- Les actions « Relancer les foyers en attente » et « Marquer les chèques reçus comme remis »
  viendront avec leurs fiches (relance, F3).
- L'admin pointe depuis son propre espace (`/admin/cheques`, entrée « Chèques » de son menu),
  chez tous les producteurs actifs : même écran que le référent (souhait du 2026-11-19).
