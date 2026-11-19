# 0025. Avoirs créés depuis un signalement

- Statut : accepté
- Date : 2026-11-19

## Contexte

Un signalement ouvert (ADR 0024) attend une décision du référent du producteur ou d'un admin.
S'il est fondé, le foyer reçoit un avoir, déduit de son chèque chez ce producteur au mois
suivant (story F2). La déduction à la clôture existe déjà (ADR 0015) : un avoir en attente est
déduit du chèque suivant du foyer chez ce producteur, quel que soit le délai ; s'il dépasse le
montant, le reste attend la commande d'après.

## Décision

1. **« Créer un avoir »** à côté de « Rejeter », sur les signalements à traiter (référent :
   « Avoirs » ; admin : « Signalements »). Montant proposé : le prix payé pour la quantité
   signalée (prix gardé sur la ligne de commande), ajustable, strictement positif.
2. **« Autre »** : avoir possible à l'appréciation du référent, qui confirme que le produit a été
   retiré (case à cocher obligatoire). Pour « manquant » ou « abîmé », le signalement dit déjà que
   le panier a été retiré.
3. **Un seul avoir par signalement** (`credit.report_id`, unique) ; le signalement passe à
   « crédité ». Journal : création de l'avoir et décision sur le signalement.
4. **Historique** : tableau des avoirs filtrable par producteur et par foyer, avec l'origine et
   l'état (en attente du prochain chèque, ou déduit du chèque de tel mois).
5. **Row Level Security des avoirs**, comme les chèques (ADR 0021) : lus par le foyer, l'admin,
   le référent et le compte du producteur, la tâche de clôture ; écrits par l'admin, le référent
   du producteur et la clôture. Jusqu'ici, toute personne de l'AMAP pouvait les lire.

## Pourquoi

- Proposer le prix payé évite un calcul au référent, qui reste libre d'ajuster (geste
  commercial, produit en partie abîmé).
- La case « produit retiré » rend visible la règle « jamais d'avoir pour un produit non retiré »
  au moment où elle compte.

## Conséquences

- La famille voit la déduction sur son récapitulatif et sa liste de chèques une fois le chèque
  calculé ; un affichage plus détaillé des avoirs côté famille viendra avec E2.
- Le producteur voit les avoirs déduits dans ses paiements (F4).
