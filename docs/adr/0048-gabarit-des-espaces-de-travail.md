# 0048. Gabarit des espaces admin et référent sur téléphone

- Statut : accepté
- Date : 2026-11-26

## Contexte

Les espaces administrateur et référent (`DesktopShell`) avaient été pensés pour l'ordinateur :
un menu latéral toujours ouvert de 288 px. Sur un téléphone, il prenait presque tout l'écran.
Or des référents pointent les chèques ou consultent un bon de commande à la distribution,
téléphone en main. La charte du 2026-11-26 (story S14, fiche #115) décrit un gabarit qui
s'adapte à la largeur de l'écran.

## Décision

1. **À partir de 1 024 px (`lg`)** : une colonne de 256 px à gauche, collée sous l'en-tête,
   avec une bordure fine. C'est un simple bloc `aside`, pas un tiroir MUI : rien ne s'ouvre ni
   ne se ferme.
2. **En dessous** : le menu se replie derrière un bouton (hamburger, qui devient une croix). Il
   s'ouvre dans un tiroir MUI temporaire, au-dessus d'un voile. Le tiroir apporte ce qu'il faut
   pour le clavier : focus gardé à l'intérieur, fermeture par Échap, focus rendu au bouton. Le
   bouton porte `aria-expanded` et `aria-controls`. Un clic sur le voile ou sur une entrée ferme
   le menu.
3. **En-tête collant de 64 px** : bouton menu et nom de l'AMAP à gauche ; bouton « Mode »,
   affichage clair ou sombre, prénom (masqué sous 600 px) et « Mon compte » à droite.
4. **Bouton « Mode »** à la place de l'ancien sélecteur d'espace : un menu déroulant avec les
   modes de cette AMAP, y compris le mode consomm'acteur (le foyer de la personne). Il
   n'apparaît qu'à partir de deux modes. Son nom accessible reste complet (« Mode
   administrateur ») même quand le libellé affiché est raccourci (« Admin ») ; le libellé court
   est toujours un mot du nom (WCAG 2.5.3 : « Consomm'acteur » et non « Conso »).
   Depuis la fiche #126, c'est **le seul endroit où choisir le mode** : il est aussi dans
   l'en-tête de l'espace consomm'acteur (gabarit mobile) ; dans les espaces admin et référent,
   sous 1 024 px, il passe **en tête du menu replié**, ce qui laisse la place au nom de l'AMAP.
5. **Carte de l'AMAP** sous le menu : nom, foyers actifs et producteurs (lecture filtrée par
   la RLS, `getAmapSummary`).
6. **Menus nommés** « Navigation administrateur », « Navigation référent », « Navigation de la
   plateforme ».
7. **Dialogues** : sous 600 px, presque plein écran, avec 16 px de marge (réglé une fois dans
   le thème).

## Pourquoi

- **Deux rendus du menu plutôt qu'un tiroir qui change de forme** : le choix se fait en CSS
  (`display` selon la largeur). Le serveur n'a pas à deviner la taille de l'écran, et la page
  ne « saute » pas au chargement. Le menu masqué par `display: none` n'est ni visible ni lu par
  les lecteurs d'écran : un seul menu existe à la fois pour eux.
- **Tiroir MUI sur téléphone** : refaire à la main le piège à focus et la fermeture par Échap
  serait plus risqué que d'utiliser un composant déjà testé.

## Complément (deuxième PR de la fiche #115)

- **Réglages faits une fois dans le thème**, pas écran par écran :
  - boutons pilule de 40 px (au-dessus des 24 px du critère WCAG 2.5.8) ;
  - cartes `Paper variant="outlined"` : fond de surface, bordure `outlineVariant`, coins de 16 px ;
  - en-têtes de tableau sur `surfaceContainerLow`, survol léger des lignes ;
  - puces pilules ;
  - dialogues aux coins de 24 px ;
  - snackbar aux coins de 16 px, avec une icône d'état (`severity`, réussite par défaut).
- **Deux composants partagés** :
  - `ConfirmDialog` : icône ronde, titre, résumé, « Annuler » et action principale ; variante
    `destructive` pour ce qui est difficile à défaire ;
  - `SectionTitle` : feuille décorative, titre dans la police de l'AMAP, compteur en pastille.
- **Deux colonnes seulement à partir de 1 280 px** (éditeur de page, « Mes producteurs ») : en
  dessous, le menu de 256 px laisse trop peu de place.

## Conséquences

- Les autres points de la charte (bandeaux sur chaque écran, boutons, cartes, deux colonnes à
  partir de 1 280 px, tableaux qui défilent dans leur carte) viendront dans les PR suivantes de
  la fiche #115.
- Les captures de référence des écrans admin changent : à régénérer avec l'étiquette
  `captures` (ADR 0002).
