# 0039. Reprendre la commande du mois précédent

- Statut : accepté
- Date : 2026-11-21

## Contexte

Beaucoup de familles commandent à peu près la même chose chaque mois. La story D4 propose de
partir de la commande du mois précédent : recopier les quantités des produits encore au
catalogue et disponibles, signaler les autres, et ne rien enregistrer sans confirmation.

## Décision

1. **Bouton « Reprendre ma commande de [mois] »** en haut de l'écran de commande (écran 2),
   pour une famille adhérente quand des catalogues sont publiés.
2. **Aperçu d'abord** (`planOrderReuse`), dans une fenêtre :
   - ce qui sera recopié, avec la quantité du mois ;
   - ce qui le sera en partie (produit indisponible certaines semaines) ;
   - ce qui ne le sera pas (plus au catalogue, ou indisponible tout le mois).
3. **Correspondance semaine par semaine** (`planReuse`, `domain/order-reuse.ts`) : la 1re
   distribution du nouveau mois reprend la 1re du mois précédent, la 2e la 2e… ; une semaine de
   plus reprend la dernière. Le même produit est retrouvé d'un mois à l'autre par sa fiche
   commune (`product`), au prix du nouveau catalogue.
4. **Recopie après confirmation** (`applyOrderReuse`) : le plan est recalculé, puis chaque case
   est enregistrée par `setOrderQuantity`, avec tous ses contrôles (adhésion, période ouverte,
   disponibilité, semaines verrouillées). Les quantités déjà saisies pour ces produits et ces
   semaines sont remplacées ; les autres ne bougent pas.

## Pourquoi

- Semaine par semaine plutôt qu'une « quantité habituelle » : une famille qui commande une
  semaine sur deux garde son rythme.
- Passer par `setOrderQuantity` garantit que la reprise ne contourne aucune règle de la saisie.

## Conséquences

- Les vacances du mois précédent (semaine fermée) ne se reportent pas : seules les distributions
  ouvertes comptent.
- La famille vérifie ensuite producteur par producteur, comme pour une saisie à la main.
