# 0029. « Mes paiements » du producteur

- Statut : accepté
- Date : 2026-11-20

## Contexte

Le producteur veut savoir où en sont ses chèques (story F4, écran P4) : lesquels le référent a
reçus, lesquels manquent, ce que les avoirs ont retiré, et quand il recevra les chèques. Le
référent pointe déjà les chèques (F1) et crée les avoirs (F2) ; la Row Level Security (ADR 0021)
laisse déjà le compte du producteur lire ses chèques et ses avoirs.

## Décision

1. **Écran `/producteur/paiements?mois=AAAA-MM`**, en lecture seule, pour l'AMAP courante :
   par défaut le mois le plus récent qui a des chèques. En haut, « N / M chèques reçus », le
   montant attendu, les avoirs déduits et la date de remise ; puis les chèques « À suivre »
   (en attente, ou écart pas encore réglé) et les chèques « Reçus », foyer par foyer ; les
   avoirs accordés ; enfin les autres mois, un lien chacun.
2. **État d'un chèque vu par le producteur** (`paymentState`, `domain/producer-payments.ts`) :
   en attente, écart en cours, reçu (écart réglé compris), remis. Le numéro de chèque n'est pas
   montré : il ne sert qu'au référent.
3. **Date de remise** : la remise réelle quand tous les chèques du mois sont remis (F3, à
   venir) ; sinon la première distribution du mois, comme sur la liste de chèques des familles
   (E2), si elle n'est pas passée ; sinon « pas encore connue ».
4. **Avoirs** : ceux qui attendent d'être déduits, et ceux déduits des chèques du mois affiché.
   Le signalement d'origine (produit, motif) reste caché au producteur, comme décidé pour F5 :
   il voit le foyer, le montant et le chèque où l'avoir est déduit.
5. **Mêmes droits que « À préparer »** (ADR 0028) : le producteur lui-même, ou son référent
   (`requireCatalogEditor`).

## Pourquoi

- Le producteur n'agit pas sur les chèques : un écran de lecture, sans case ni champ, évite
  toute confusion avec l'écran de pointage du référent.
- Séparer « À suivre » et « Reçus » répond d'abord à sa question : qui ne m'a pas encore payé ?

## Conséquences

- Quand la remise des chèques (F3) sera faite, « Remis le … » s'affichera sans autre changement.
- Pas de vue « toutes mes AMAP » : reportée en V2, comme pour « À préparer ».
