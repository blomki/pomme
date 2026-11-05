# Pomme — consignes pour Claude Code

Application de gestion d'AMAP, multi-AMAP. Le code est écrit avec Claude Code : il sert
aussi de support d'apprentissage. Explique le « pourquoi » dans les commentaires et les ADR,
en langage simple.

## Langues

- **Code et base en anglais** : noms de variables, fonctions, tables (snake_case), colonnes.
- **Interface en français** : aucun texte en dur dans les composants ; tout passe par
  `src/i18n/messages/fr.json` (next-intl, `useTranslations` / `getTranslations`).
- Commentaires, ADR, documentation et messages de PR en français.
- Vocabulaire métier : AMAP, foyer, amapien, producteur, référent, catalogue, commande, chèque,
  avoir, émargement, permanence, distribution. Garder ces mots en français dans l'interface ; en
  code, utiliser les noms du modèle de données (`household`, `producer`, `cheque`, `credit_note`…).

## Où mettre quoi

- `src/domain/` : **toutes les règles métier**, en fonctions pures, sans import de Next.js, React,
  Drizzle ni de `server/`. Montants en **centimes entiers**.
- `src/server/` : Server Actions et lectures ; validation Zod de chaque entrée ; `requireRole`
  dans chaque action.
- `src/db/` : schéma Drizzle, migrations, politiques RLS (isolation par `amap_id`).
- `src/ui/` : thème et composants partagés.
- `src/app/` : routes seulement, le plus mince possible (lit, appelle `server/`, affiche).
- Dates : `formatDate` de `src/i18n/dates.ts` (français, fuseau Europe/Paris), jamais
  `toLocaleString` ni le fuseau du serveur.

## Règles

- **Tests obligatoires** : toute règle de `domain/` a ses tests unitaires ; toute Server Action a
  un test d'accès autorisé et un test d'accès refusé ; tout parcours d'une user story M a son test
  de bout en bout avec axe-core. Pas de PR sans tests.
- **Accessibilité** RGAA 4.1 / WCAG 2.2 AA : vrais boutons et liens, étiquettes de champs,
  focus visible, utilisable au clavier seul.
- **Sécurité** : jamais de SQL concaténé, jamais de secret dans le dépôt, jamais de données réelles
  en développement.
- **Une décision technique importante = un ADR** dans `docs/adr/` (copier `0000-modele.md`,
  numéroter à la suite).
- Adresses réservées, interdites comme adresse d'AMAP : `producteur`, `plateforme`, `api`, et tout
  ce qui commence par `_` (voir ADR 0001).

## Git

- Une branche par fiche (`s1-init-nextjs`, `c2-fiches-produit`…), pull request obligatoire,
  `main` toujours déployable.
- Commits conventionnels, description en français : `feat(commande): totaux en direct`,
  `fix(avoirs): arrondi des centimes`. Contrôlé par commitlint au moment du commit.
- La PR référence sa fiche (`Closes #12`) et coche ses critères d'acceptation.

## Tests

- Unitaires et composants à côté du code (`x.ts` → `x.test.ts`, `Y.tsx` → `Y.test.tsx`).
- Intégration (vrai PostgreSQL) dans `tests/integration/`, avec `startPostgres()`.
- Bout en bout dans `tests/e2e/` : chaque nouvel écran est ajouté à `pages.spec.ts` (ou à son
  propre fichier) et passe `expectNoSeriousA11yViolations`.
- Écran clé : l'ajouter à `tests/visual/screens.spec.ts` ; les références sont produites par le
  workflow « Mettre à jour les captures », jamais en local (voir ADR 0002).
- Tester le comportement visible (rôles, textes), pas les détails d'implémentation.

## Avant de proposer une PR

```bash
pnpm check              # types, ESLint, mise en forme
pnpm test:coverage      # unitaires + composants, couverture ≥ 90 % sur domain/
pnpm test:integration   # si la fiche touche la base (Docker requis)
pnpm build
pnpm test:e2e
```

## Références

- Cahier des charges fonctionnel : https://claude.ai/code/artifact/7ebb9901-15fc-4128-8887-e39256381552
- Modèle de données V1 : https://claude.ai/artifact/39TX6MSLRnpYNG9CrPysJu
- Cahier des spécifications techniques V1 : https://claude.ai/artifact/UVEGrFVUozbpVt997woXVZ
- Backlog : issues GitHub de ce dépôt
