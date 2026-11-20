# 0026. Liste des chèques de la famille, à imprimer

- Statut : accepté
- Date : 2026-11-20

## Contexte

La famille prépare ses chèques chez elle et les remet à la première distribution du mois
(story E2). Elle doit voir, pour chaque producteur, le montant à écrire (avoirs déduits) et
l'ordre du chèque, et pouvoir imprimer la liste. L'écran « Liste des chèques » (D6) ne montrait
la liste que hors période de commande ouverte : du 10 au 25 du mois, quand les commandes du mois
suivant sont ouvertes, la famille ne voyait plus les chèques du mois qui vient d'être clôturé.

## Décision

1. **La liste montre toujours la dernière période clôturée** (jusqu'au mois prochain), même
   pendant les commandes du mois suivant ; une ligne renvoie alors vers le récapitulatif de la
   commande en cours. Sans chèque et pendant les commandes, le récapitulatif en tient lieu.
2. **Ordre du chèque à la demande** à l'écran (« Voir l'ordre du chèque », bouton qui ouvre et
   ferme), **toujours imprimé**.
3. **« Rien ce mois-ci »** : les producteurs sans commande ce mois-ci, commandés au moins une
   fois sur les trois mois précédents (`nothingThisMonth`, `domain/cheques.ts`).
4. **Impression** : un bouton « Imprimer la liste » (impression du navigateur, PDF compris).
   Sur papier : ni en-tête ni menu ni bouton, noir sur blanc, avec le nom du foyer et de l'AMAP
   en tête ; un chèque n'est pas coupé entre deux pages.

## Pourquoi

- Une feuille de styles d'impression évite une seconde page à maintenir : ce qui est à l'écran
  est ce qui s'imprime, moins les commandes.
- Imprimer l'ordre de chaque chèque : on remplit les chèques à partir de la feuille, loin de
  l'écran.

## Conséquences

- Les chèques des mois plus anciens ne sont pas listés : seulement la dernière période
  clôturée.
