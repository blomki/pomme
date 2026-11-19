# 0024. Signalements : produit manquant ou abîmé

- Statut : accepté
- Date : 2026-11-19

## Contexte

Un produit manque ou arrive abîmé à la distribution. La famille doit pouvoir le signaler, et
l'admin doit pouvoir reporter les écarts notés sur la feuille d'émargement (émargement papier en
V1). Le référent du producteur décide ensuite : avoir (F2) ou rejet (story F5).

## Décision

1. **Table `report`** : une ligne de commande (donc un foyer, un produit, une distribution),
   une quantité, un motif (`missing`, `damaged`, `other` avec précision obligatoire), la source
   (`family`, `admin`), le statut (`open`, `credited`, `rejected`), la décision (qui, quand, motif
   du rejet). Jamais supprimée.
2. **Quantité** : de 1 à la quantité commandée, moins ce qui est déjà signalé sur la même ligne
   (un rejet libère la quantité).
3. **Délai pour la famille : jusqu'à la clôture des commandes qui suit la distribution**
   (décision du 2026-11-19), la clôture réelle si l'admin a clôturé plus tôt. Sans clôture
   prévue après la distribution, pas de limite pour l'instant. L'admin n'a pas de délai : la
   feuille d'émargement arrive après coup.
4. **Qui traite** : le référent du producteur, ou un admin (deuxième vérification) — décision du
   2026-11-19. Pour l'instant : rejeter, avec un motif montré à la famille. L'avoir arrive avec
   F2.
5. **Où** : la famille sur « Signaler un problème » (accueil) ; le référent sur « Avoirs »
   (`/referent/avoirs`) ; l'admin sur « Signalements » (`/admin/signalements`), qui porte aussi
   le report des écarts d'émargement. Tant qu'un signalement est ouvert, le tableau de bord de
   l'admin affiche une tâche « Bloquant ».
6. **Pas d'email** au référent (décision du 2026-11-19) : le signalement apparaît dans son
   espace et dans les tâches de l'admin.
7. **Row Level Security** : la famille lit et crée les signalements de son foyer (en son nom,
   ouverts) ; le référent du producteur et l'admin les lisent et les décident ; l'admin peut en
   créer pour tout foyer. Le compte du producteur ne les voit pas.

## Pourquoi

- Rattacher le signalement à une ligne de commande donne d'un coup le foyer, le produit, le
  producteur, la distribution et le prix payé (base du montant de l'avoir, F2).
- Le délai jusqu'à la clôture suivante laisse le temps de signaler, tout en permettant de
  déduire l'avoir dès le chèque suivant.
- Un motif de rejet visible par la famille évite les incompréhensions.

## Conséquences

- F2 ajoutera « Créer un avoir » à côté de « Rejeter », et le lien entre l'avoir et le
  signalement.
- Le jeu de données fictif donne désormais au foyer de `amapien.demo` des commandes du mois en
  cours, pour pouvoir essayer le signalement.
