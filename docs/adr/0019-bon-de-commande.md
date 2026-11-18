# 0019. Bon de commande : page imprimable, tableur, lien signé pour le producteur

- Statut : accepté
- Date : 2026-11-18

## Contexte

Story E1 : le référent consulte le bon de commande d'un producteur (quantités par produit et
par distribution, détail par foyer), navigue de mois en mois, l'exporte en PDF et en tableur,
et l'envoie au producteur par email. Le cahier technique prévoyait des PDF rendus par Playwright
côté serveur, ce qui demande d'installer Chromium chez Clever Cloud. Choix du porteur du projet
le 2026-11-18.

## Décision

1. **PDF par l'impression du navigateur.** Une page sans menu, mise en forme pour l'A4
   (`/<amap>/bon-de-commande/<producteur>/<mois>`) : « Imprimer », puis « Enregistrer au format
   PDF ». À l'impression, un foyer n'est pas coupé entre deux pages, et le texte est noir sur
   blanc même en mode sombre. Les tableaux sont les mêmes qu'à l'écran (`OrderFormTables`).
2. **Tableur au format CSV** à la française : « ; », virgule décimale, UTF-8 avec BOM pour
   Excel. Toute cellule qui commence comme une formule (`= + - @`) est neutralisée.
3. **Email au producteur avec un lien signé** vers la page imprimable, demandé par le porteur
   du projet : le producteur doit pouvoir imprimer sans difficulté, même sans compte Pomme. Le
   lien porte une clé `?cle=<expiration>.<signature>` (HMAC-SHA256, clé dérivée de
   `BETTER_AUTH_SECRET`), valable 60 jours, pour ce producteur et ce mois seulement, en
   lecture. L'email lui-même ne contient aucun nom de foyer : seulement les quantités à
   préparer par distribution. L'adresse est celle de la fiche du producteur.
4. **Visible avant la clôture, à titre provisoire** : pendant les commandes, le référent voit
   le bon en cours, marqué « Provisoire » ; l'impression, le tableur et l'envoi n'apparaissent
   qu'après la clôture (le tableur est refusé avant, code 409).
5. **Accès** : le référent du producteur et le producteur lui-même (`requireCatalogEditor`),
   comme pour le catalogue. Un admin qui ne suit pas ce producteur ne le voit pas.
6. **Montants** : au prix gardé sur chaque ligne ; après la clôture, l'avoir déduit et le
   chèque attendu viennent des chèques calculés à la clôture.

## Pourquoi

- L'impression du navigateur ne demande rien sur le serveur, donne un PDF fidèle à l'écran, et
  servira aussi à la liste des chèques (E2) et à la feuille d'émargement (E3).
- Un lien signé évite de créer un compte pour chaque producteur, sans rendre le bon de commande
  public : sans la clé, impossible de deviner l'adresse valable, et la clé expire.

## Conséquences

- Changer `BETTER_AUTH_SECRET` invalide les liens déjà envoyés (le référent renvoie l'email).
- Le lien laisse lire les noms des foyers qui commandent chez ce producteur à qui le reçoit : il
  ne doit être envoyé qu'à l'adresse du producteur.
- La correction d'une commande par un référent (reportée de D3) fera l'objet d'une fiche à part.
- La feuille d'émargement (E3) pourra, si la règle « jamais de bloc coupé » l'exige, revenir sur
  un rendu serveur ; ce choix ne vaut ici que pour le bon de commande.
