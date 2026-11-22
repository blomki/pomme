# 0037. Remise des chèques au producteur

- Statut : accepté
- Date : 2026-11-21

## Contexte

Le référent rassemble les chèques reçus des familles, puis les remet au producteur, en général
à une distribution (story F3). Le producteur suit la remise dans « Mes paiements » (F4,
ADR 0029). Le pointage (F1, ADR 0023) refuse déjà de modifier un chèque remis.

## Décision

1. **Un bouton par producteur et par mois**, en bas de l'écran de pointage : « Marquer les
   N chèques reçus comme remis à <producteur> ». Tous les chèques prêts passent d'un coup à
   « remis », avec la date et l'auteur (`handed_over_at`, `handed_over_by`).
2. **Un chèque dont l'écart reste à traiter est retenu** (`canHandOver`,
   `domain/cheques.ts`) : une fois remis, il ne se modifie plus, l'écart ne pourrait plus être
   réglé. L'écran indique combien de chèques attendent.
3. **Confirmation avant la remise**, plutôt qu'un « Annuler » : la remise correspond à un
   geste réel (les chèques quittent le référent), elle n'a pas à être défaite.
4. **Journal** : une ligne par chèque remis.

## Pourquoi

- Remettre par lot suit la réalité : le référent donne l'enveloppe entière au producteur.
- Retenir les écarts évite qu'un chèque litigieux parte sans que le désaccord soit réglé.

## Conséquences

- Côté producteur, « Mes paiements » affiche « Remis le … » quand tous les chèques du mois
  sont remis, sans autre changement.
- Une remise faite par erreur se corrige directement dans la base (cas exceptionnel, non prévu
  à l'écran).
