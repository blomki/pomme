# 0040. Contacts : appeler ou écrire sur Signal

- Statut : accepté
- Date : 2026-11-21

## Contexte

Une famille a parfois besoin de joindre le producteur ou le référent qui le suit (retard,
produit manquant, question sur la commande). La story H4 demande des boutons « Appeler » et
« Écrire sur Signal », affichés seulement pour un numéro au format international.

## Décision

1. **Bloc « Contacts »** en bas de la page de commande d'un producteur (écran 3) : le
   producteur, puis chacun de ses référents.
2. **Liens** (`contactLinks`, `domain/phone.ts`) : « Appeler » (`tel:+33…`) et « Écrire sur
   Signal » (`https://signal.me/#p/+33…`, ouvert dans une nouvelle fenêtre, annoncé aux lecteurs
   d'écran). Seulement pour un numéro au format international ; sinon « Pas de numéro
   renseigné ».
3. **Qui voit ces numéros** : les membres d'un foyer de l'AMAP (`getProducerContacts`) ; un
   visiteur ou une personne sans foyer est refusé.

## Pourquoi

- Le format international est celui qu'enregistre Pomme (contrainte de la base pour les
  comptes) : un numéro mal formé ne doit pas produire un lien qui appellerait le mauvais numéro.
- Signal plutôt que WhatsApp : messagerie chiffrée, sans publicité, choisie par le cahier des
  charges.

## Conséquences

- Les numéros des référents deviennent visibles des familles de l'AMAP. À rappeler aux
  référents quand l'admin enregistre leur numéro (la politique de confidentialité, S9, devra le
  mentionner).
