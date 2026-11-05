# 0004. Thème Material Design 3 sur Material UI

- Statut : accepté
- Date : 2026-11-05

## Contexte

Chaque AMAP a ses couleurs et sa police de titre ; l'interface doit suivre Material Design 3
(M3), en clair et en sombre, avec un contraste garanti (RGAA 4.1 / WCAG 2.2 AA). Material UI v9
implémente Material Design 2 : il n'existe pas de bibliothèque M3 mûre pour React.

## Décision

1. **Couleurs** : la bibliothèque `material-color-utilities` de Google (copie partielle dans
   `src/ui/theme/vendor/`, le paquet npm 0.4.0 étant mal publié) tire de chaque couleur clé de
   l'AMAP une palette tonale (ton 0 à 100) ; chaque rôle M3 (`primary`, `onPrimary`, `surface`…)
   prend un **ton fixe** de sa palette, comme le schéma de référence M3 (`src/ui/theme/m3-colors.ts`).
   Neutres dérivés de la primaire s'ils ne sont pas saisis ; rouge d'erreur M3 commun.
2. **Thème MUI** (`create-theme.ts`) : rôles M3 placés dans la palette MUI (et tous exposés
   dans `palette.m3`), variables CSS pour les deux modes, échelle typographique M3, rayons M3,
   élévation par teinte de surface, couches d'état (8 %, 10 %), courbes de mouvement M3 coupées
   par « réduire les animations ». Variante de bouton `tonal` ajoutée.
3. **Mode d'affichage** : attribut `data-mui-color-scheme` sur `<html>`, posé avant l'affichage
   par `InitColorSchemeScript` (pas de flash). Choix clair / sombre / automatique mémorisé dans
   le navigateur ; il passera dans le profil quand les comptes existeront (story A3).
4. **Polices** servies par l'application (`next/font/local`), sans appel à Google Fonts :
   Carlito (texte), Pattaya (titres de Cambremer). Fichiers d'origine, seulement convertis en
   WOFF : la licence OFL considère un sous-ensemble de caractères comme une version modifiée.
5. **Gabarits** (`src/ui/layout`) : mobile (barre du haut, barre du bas pour le producteur) et
   ordinateur (menu latéral permanent, sélecteur d'espace). Chaque espace applique le thème de
   son AMAP (`AmapThemeBoundary`), lu en base ; adresse inconnue = page 404.
6. **Page de démonstration** `/plateforme/theme/<amap>` : visible en développement et dans la CI
   (`POMME_DEMO_PAGES=1`), jamais en production.

## Pourquoi

- Des **tons fixes** rendent le contraste indépendant de la couleur choisie : HCT règle la
  luminance par le ton. Une AMAP peut choisir un jaune pâle sans rendre l'interface illisible.
  Les tests vérifient chaque paire texte / fond sur les thèmes réels et des couleurs extrêmes
  (`contrast.test.ts`), et axe-core vérifie chaque page, en clair et en sombre.
- Les **variables CSS** changent de mode sans recalculer le thème ni recharger la page.
- Des polices **auto-hébergées** évitent de transmettre l'adresse IP des visiteurs à Google.

Écartés : les couleurs dynamiques complètes de Google (`DynamicScheme`), dont l'API change
d'une version à l'autre et ajuste les tons de façon moins prévisible ; une bibliothèque M3
tierce (Material Web) mal intégrée à React.

## Conséquences

- Ne jamais écrire une couleur en dur : utiliser la palette MUI (`primary.main`, `text.secondary`)
  ou un rôle M3 via `m3("surfaceContainer")`.
- Les tests de bout en bout ont besoin de la base et du jeu de données fictif (`pnpm db:seed`).
- Le réglage des couleurs par l'AMAP (story A4) réutilisera `findContrastFailures` pour
  prévenir l'administrateur, même si les tons fixes rendent l'échec improbable.
