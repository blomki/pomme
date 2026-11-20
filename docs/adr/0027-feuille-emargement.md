# 0027. Feuille d'émargement : page A4 imprimée par le navigateur

- Statut : accepté
- Date : 2026-11-20

## Contexte

En V1, l'émargement se fait sur papier (story E3) : l'admin imprime chaque mois une feuille A4,
les bénévoles la remplissent pendant les distributions, et les écarts remontent ensuite par les
signalements (F5). Le cahier technique prévoyait un PDF rendu côté serveur par Playwright.

## Décision

1. **Page imprimable plutôt que PDF serveur** (décision du 2026-11-20) : `/<amap>/emargement/<mois>`,
   réservée aux admins, sans menu, au format A4 (`@page`), avec un bouton « Imprimer » ; le PDF
   s'obtient par « Enregistrer au format PDF » du navigateur. Accès depuis « Planning des
   permanences » (feuille du mois affiché).
2. **Contenu** : consigne (case « Cmd » grisée = quantité commandée, entourer si conforme, +1/−1
   dans la case « ± » en cas d'écart, pas de visa) ; tableau des 3 bénévoles par distribution
   (nom, téléphone, signature) et un commentaire ; (1) livraisons par producteur, avec une ligne
   « Observations » ; (2) retraits par foyer, produits groupés par producteur, sur une nouvelle
   page. Ordre alphabétique partout ; seules les distributions ouvertes du mois.
3. **Mise en page** : chaque bloc a son propre en-tête des semaines (répété par le navigateur si
   un bloc dépasse une page), n'est pas coupé entre deux pages sauf s'il dépasse une page, et les
   cases grisées s'impriment (`print-color-adjust: exact`).
4. **Capture visuelle** : sur une page de démonstration aux données fixes
   (`/plateforme/demo/emargement`, jamais en production), en mode impression, pour qu'elle ne
   change pas d'un mois à l'autre.

## Pourquoi

- Un Chromium sur le serveur de production (instance nano, 512 Mo) serait trop lourd et
  demanderait des bibliothèques système chez Clever Cloud ; une instance plus grosse coûterait
  plus. Le navigateur de l'admin sait déjà imprimer et faire un PDF.
- Même approche que le bon de commande (E1) et la liste des chèques (E2) : une seule manière
  d'imprimer dans Pomme.
- Écarté : un PDF dessiné sans navigateur (pdfkit) : mise en page à coder à la main, plus
  longue à faire évoluer.

## Conséquences

- Les noms des bénévoles restent à écrire à la main jusqu'au planning des permanences (G2) ;
  ils pourront alors être préremplis.
- Le rendu dépend un peu du navigateur de l'admin ; la capture visuelle de la CI vérifie celui de
  Chromium.
