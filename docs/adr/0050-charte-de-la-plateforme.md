# 0050. Charte de la plateforme et écran de connexion

- Statut : accepté
- Date : 2026-11-28

## Contexte

Avant la connexion, on ne sait pas encore à quelle AMAP la personne se connecte. Les écrans de
niveau plateforme (connexion, « Mes espaces », compte, gestion de la plateforme) doivent donc
suivre la charte de Pomme, et non le thème d'une AMAP (fiche #123). Jusqu'ici, la plateforme
utilisait un vert, un brun et un doré, qui servaient aussi de couleurs par défaut aux AMAP.

## Décision

1. **Couleurs** : navy `#0A2540` (primaire), bleu `#635BFF` (secondaire), or `#C7A84B`
   (tertiaire), vert `#0D9488` (succès), fond `#F8FAFC`, fond secondaire `#EFF6FF`, texte
   `#0A2540`. Le thème est construit avec **la même mécanique que les AMAP** (palettes tonales
   M3 calculées à partir des couleurs clés, mode sombre compris). En mode clair, les couleurs
   exactes de la charte remplacent ensuite les tons calculés (`lightOverrides` de
   `PLATFORM_THEME`, `src/ui/theme/key-colors.ts`).
2. **Contrastes** (WCAG 2.2 AA), vérifiés par les tests (`contrast.test.ts`) :
   - navy et bleu portent un texte blanc (15,5:1 et 4,7:1) ;
   - l'or est trop clair pour du blanc (2,3:1) : il porte le texte navy (6,8:1) ;
   - le vert `#0D9488` donne 3,7:1 avec du blanc : MUI utilise le ton 40 de sa palette pour les
     textes sur fond de succès (puces « Actif »…).
3. **Les AMAP ne changent pas** : les anciennes couleurs de la plateforme deviennent
   `DEFAULT_AMAP_KEY_COLORS`, qui remplacent une couleur absente du thème d'une AMAP et
   pré-remplissent la création d'une AMAP.
4. **Titres en Source Sans 3** (nom actuel de « Source Sans Pro », Adobe, licence OFL), en
   semi-gras, servie par l'application comme Carlito et Pattaya (fichier WOFF2 original, sans
   Google Fonts). Texte courant inchangé (Carlito). Réservée à la plateforme : elle n'est pas
   proposée aux AMAP.
5. **Carte de connexion** (`CaptchaCard`) : son contenu a la largeur du widget Friendly Captcha
   (316 px, `CAPTCHA_WIDTH`) et son fond est exactement celui du widget (`#fafafa` en clair,
   `#171717` en sombre). Le formulaire d'adhésion s'aligne sur la même largeur.
6. **Messages passagers dans le snackbar** : une `Alert` MUI dans un `Snackbar`, avec icône
   d'état, bouton « Fermer le message » et annonce aux lecteurs d'écran (`status` pour une
   confirmation ou une information, `alert` pour un avertissement ou une erreur). Couleurs de
   surface inversée M3, lisibles en clair et en sombre. Tous les retours d'action passaient déjà
   par `useSnackbar()` : ils en profitent. Les messages de la page de connexion (déconnexion,
   lien expiré, lien envoyé, limite d'envois, captcha, passkey) y passent aussi.

## Pourquoi

- Même mécanique que les AMAP : un seul code de thème à maintenir, et le mode sombre calculé
  sans travail de plus. Les couleurs imposées ne touchent que le mode clair, que la charte décrit.
- Une couleur exacte pour l'or et le vert aurait donné du texte illisible : on garde la teinte,
  et on choisit la couleur du texte (or) ou un ton plus foncé (vert) pour tenir le contraste.
- Fond de carte identique au widget : sinon le widget apparaît comme un rectangle gris posé
  sur un fond blanc. C'est une exception assumée à la règle « pas de couleur en dur », la couleur
  venant d'un composant extérieur.
- **Erreurs de formulaire laissées à leur place** : une erreur liée à des champs (« Corrigez les
  champs signalés ») ou à un dialogue reste affichée près de ceux-ci (RGAA 11.10, 11.11) ;
  dans un snackbar, elle disparaîtrait loin du champ concerné. Le formulaire d'adhésion garde
  ses messages, qui prennent le focus après l'envoi.

## Conséquences

- Les captures de référence des écrans de la plateforme et de tous les messages changent : à
  régénérer avec l'étiquette `captures`.
- Le fond du widget dépend de sa bibliothèque : à revérifier à chaque mise à jour de
  `@friendlycaptcha/sdk` (valeurs reprises dans `src/ui/forms/Captcha.tsx`).
- Le message « lien envoyé » reste affiché jusqu'à sa fermeture (consigne à suivre) ; les autres
  se ferment seuls au bout de 6 secondes.
