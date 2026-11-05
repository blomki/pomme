# 0001. Choix de la stack technique

- Statut : accepté
- Date : 2026-11-04 (décision), 2026-11-05 (mise en place)

## Contexte

Pomme remplace AmapJ à Cambremer, puis doit accueillir d'autres AMAP. Quatre impératifs :
code testé, application sécurisée avec sauvegardes, interface au plus près de Material Design 3,
accessibilité (RGAA 4.1 / WCAG 2.2 AA). Le code est écrit avec Claude Code : la stack doit
être répandue et bien documentée.

## Décision

Une seule application **Next.js 16 (App Router) + React 19 + TypeScript strict**, gérée avec
**pnpm** sur **Node.js 24 LTS**, avec :

- Material UI v9 et un thème « façon M3 » (fiche S4) ;
- PostgreSQL 17 avec Row Level Security, via Drizzle ORM (fiche S3) ;
- Better Auth (lien magique, passkeys, 2FA) ;
- next-intl pour les textes (français en V1), date-fns pour les dates, fuseau Europe/Paris ;
- Vitest, Playwright et axe-core pour les tests (fiche S2) ;
- hébergement Clever Cloud (fiche S7).

Le détail des versions et des raisons est dans le
[cahier des spécifications techniques](https://claude.ai/artifact/UVEGrFVUozbpVt997woXVZ).

## Pourquoi

- **Un seul langage** (TypeScript) côté navigateur et côté serveur : moins de choses à apprendre,
  erreurs détectées avant l'exécution.
- **Next.js** rend les pages publiques côté serveur (référencement, aperçus Open Graph) et héberge
  les espaces connectés dans le même projet ; les Server Actions évitent d'écrire une API à part.
- **pnpm** est rapide et refuse les « dépendances fantômes » (un paquet utilisé sans être déclaré).
- **Node 24 LTS** est maintenu jusqu'en 2028 ; la version est fixée (`.nvmrc`, `engines`,
  `engine-strict`) pour que le poste de développement, la CI et l'hébergeur tournent pareil.
- **next-intl** sort les textes du code : le vocabulaire se relit et se corrige dans un seul fichier
  (`src/i18n/messages/fr.json`), et une traduction reste possible.

Écartés : une API séparée (Express, NestJS) avec un front séparé — deux projets à maintenir pour
une petite équipe ; PHP — l'ancien outil a été piraté plusieurs fois.

## Conséquences

- Adresses : `[domaine]/<amap>` (page publique), `[domaine]/<amap>/famille|referent|admin`,
  `[domaine]/producteur`, `[domaine]/plateforme`. Les mots `producteur`, `plateforme`, `api` et
  ceux commençant par `_` sont donc **réservés** et interdits comme adresse d'AMAP (à contrôler
  à la création d'AMAP, story J1).
- Une seule langue en V1 : pas de préfixe `/fr` dans les adresses.
- Les dépendances sont figées par `pnpm-lock.yaml` ; les mises à jour passeront par Renovate et la CI.
