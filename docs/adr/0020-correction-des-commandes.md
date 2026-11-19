# 0020. Corriger la commande d'un foyer

- Statut : accepté
- Date : 2026-11-18

## Contexte

Une famille se trompe, oublie un produit ou appelle son référent parce qu'elle n'arrive pas à
saisir sa commande. Le référent (pour les producteurs qu'il suit) ou l'admin (pour tous) doit
pouvoir corriger cette commande, et chaque correction doit laisser une trace (story D7, règles
métier 3 et 17 du cahier des charges).

## Décision

1. **Le même écran que la famille**, en mode « correction » : mêmes cases, mêmes contrôles
   (produit disponible à une distribution ouverte, distribution pas encore passée, chèque pas
   encore pointé). Le contrôle de la case est une seule fonction serveur, `writeQuantity`, appelée
   par la saisie de la famille et par la correction.
2. **Deux entrées.** Le référent part du bon de commande (E1) : un lien « Corriger » sous chaque
   foyer du détail, et une liste pour ouvrir la commande d'un foyer qui n'a encore rien commandé.
   L'admin part de la fiche du foyer (« Foyers et adhésions ») : une section « Commande du mois »
   avec un lien par producteur.
3. **Qui corrige** (`correctionAccess`, `src/domain/orders.ts`) : le référent qui suit le
   producteur, ou un admin de l'AMAP. Un admin qui n'est pas le référent de ce producteur doit
   avoir fait la deuxième vérification, comme pour toute action d'admin. Ni les familles ni les
   producteurs ne corrigent.
4. **Seulement pendant la période ouverte.** Une période clôturée se rouvre d'abord (D2) : à la
   clôture, les chèques sont calculés, et les corriger après coup est le travail des avoirs (F2).
5. **Au prix du catalogue au moment de la correction** (ADR 0018, point 4), comme une saisie.
6. **Le journal** (`audit_log`, type `order`, action `correct`) garde qui, quand, le foyer, le
   produit, la distribution, et la quantité et le prix avant et après. Une correction qui ne
   change pas la quantité n'y est pas écrite.
7. **L'adhésion n'est pas contrôlée** lors d'une correction : c'est la famille qui ne peut pas
   commander sans adhésion en cours. Le référent voit un avertissement si l'adhésion du foyer
   n'est pas en cours, et décide.
8. **« Rien ce mois-ci » reste le choix de la famille** : le bouton n'apparaît pas en correction.

## Pourquoi

- Un seul écran et une seule fonction de contrôle : une règle ajoutée à la saisie s'applique
  aussi à la correction, sans risque d'oubli.
- Partir du bon de commande correspond au travail du référent, qui relit ce que son producteur
  va préparer. L'admin, lui, part d'un foyer (« la famille Martin m'a appelé »).
- Écarté : corriger une période clôturée sans la rouvrir. Il faudrait recalculer des chèques
  déjà annoncés aux familles et peut-être déjà remis ; rouvrir rend le changement visible à tous.
- Écarté : contrôler l'adhésion. Le référent corrige souvent une erreur sur une commande déjà
  passée ; le bloquer pour une adhésion à renouveler ferait perdre la commande.

## Conséquences

- La famille voit la correction sur son accueil et dans son récapitulatif sans rien de plus :
  ce sont les mêmes lignes de commande.
- La correction lit et écrit des commandes d'autres foyers : le code serveur vérifie le rôle, et
  la base le vérifie aussi (référent du producteur ou admin, ADR 0021).
- Le journal n'a pas encore d'écran de consultation : il se lit dans la base pour l'instant.
