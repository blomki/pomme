# 0033. Site public et pages

- Statut : accepté
- Date : 2026-11-21

## Contexte

Chaque AMAP a un site public ([domaine]/<amap>) : accueil, présentation, blog, mentions
légales, et bientôt « Nous rejoindre » (B2). Les administrateurs l'éditent eux-mêmes (story H2,
écrans A6 et A7). Le contenu saisi est affiché à tous les visiteurs : il ne doit jamais pouvoir
injecter de code dans la page.

## Décision

1. **Un seul type de contenu, la page** (table `page`), avec **un seul niveau de sous-pages** :
   le blog est une page principale dont les sous-pages sont les billets, triés par date (ou dans
   un ordre manuel). Adresses : `/<amap>` (accueil), `/<amap>/<page>`, `/<amap>/<page>/<sous-page>`.
   Une page principale ne peut pas prendre une adresse de l'application (`admin`, `famille`…).
2. **Statuts** : brouillon, publiée, dépubliée ; **jamais de suppression**. L'accueil et les
   mentions légales sont **obligatoires** (`role`) : créés avec chaque AMAP (fonction
   `create_amap`, migration 0033, reprise pour les AMAP existantes), ils ne se dépublient pas.
3. **Texte riche avec Tiptap**, limité à : paragraphe, intertitre (niveaux 2 et 3), listes, gras,
   italique, lien, photo. **Le serveur nettoie** le document reçu (`cleanRichText`,
   `domain/pages.ts`) : seuls ces éléments sont gardés, les liens doivent être `https`, `http`,
   `mailto` ou une adresse du site, les images doivent venir du stockage de Pomme ; un document
   démesuré est refusé. Le texte est gardé en JSON et **affiché par des composants React**
   (`RichTextView`) : jamais de HTML brut injecté, donc pas de faille XSS possible par ce
   chemin.
4. **Menu du site** : case « Dans le menu » sur les pages principales, ordre par flèches
   (avancer, reculer). Le menu public ne montre que les pages publiées.
5. **Adresse proposée d'après le titre** ; changée après une première publication, l'ancienne
   adresse est gardée (table `page_redirect`) et **redirige définitivement** vers la nouvelle,
   sous-pages comprises. Next.js répond 308, l'équivalent moderne de 301 (même traitement par
   les moteurs de recherche, la méthode HTTP en plus).
6. **Partage et référencement** : titre et description par page (Open Graph, `<title>`,
   `meta description`) ; vides, ils reprennent le titre, le résumé ou le début du texte, et
   l'image principale ou le logo de l'AMAP.
7. **Accueil** : le contenu de la page d'accueil, puis des blocs remplis automatiquement :
   prochaine distribution, cartes des producteurs, dernier billet publié.
8. **Droits** : lecture des pages publiées par tout le monde ; tout le reste (brouillons,
   écriture) réservé aux administrateurs de l'AMAP (requireRole et Row Level Security). Les
   pages publiques sont rendues côté serveur.

## Pourquoi

- Garder le JSON de l'éditeur plutôt que du HTML : on sait exactement ce qui est permis, et
  l'affichage ne dépend pas d'un nettoyeur de HTML qu'il faudrait tenir à jour.
- Un seul niveau de sous-pages couvre le besoin (présentation et ses annexes, blog et ses
  billets) sans arbre compliqué à gérer ni à afficher.

## Conséquences

- L'image de partage est l'image principale de la page (ou le logo) : pas de troisième image à
  gérer.
- « Nous rejoindre » sera une page ordinaire ; son formulaire viendra avec B2.
- Une image envoyée puis non enregistrée reste dans le stockage (sans gravité : elle n'est liée
  nulle part).
