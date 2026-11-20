# 0028. « À préparer » du producteur, semaine par semaine

- Statut : accepté
- Date : 2026-11-20

## Contexte

Le producteur prépare ses paniers distribution par distribution (story E5, écran P3). Il lui
faut les totaux à préparer, puis la liste par foyer pour étiqueter. Le bon de commande du mois
(E1) contient déjà ces quantités, colonne par colonne.

## Décision

1. **Écran `/producteur/a-preparer?semaine=<distribution>`**, pour l'AMAP courante seulement (la
   vue « toutes mes AMAP » est reportée en V2) : un onglet par distribution, les totaux à
   préparer, puis un panier par foyer (ordre alphabétique).
2. **Seulement après la clôture** des commandes du mois : avant, les familles peuvent encore
   modifier ; l'écran annonce alors le jour de clôture.
3. **Semaines proposées** : distributions ouvertes des mois clôturés, depuis une semaine en
   arrière (consultation après coup) ; par défaut la prochaine, aujourd'hui compris, sinon la
   plus récente.
4. **Calcul** : la colonne de la distribution dans le bon de commande du mois (`weekToPrepare`,
   `domain/to-prepare.ts`) ; mêmes droits que le bon de commande (le producteur lui-même, ou son
   référent), et la Row Level Security (ADR 0021) ne montre que ses commandes.

## Pourquoi

- Réutiliser le bon de commande garantit que le producteur voit exactement les quantités que le
  référent lui envoie.
- Les onglets-liens donnent une adresse par semaine : le bouton Retour et le partage marchent.

## Conséquences

- Pas d'impression d'étiquettes pour l'instant : la liste par foyer se lit sur le téléphone, ou
  s'imprime depuis le navigateur.
