# 0002. Stratégie de tests et intégration continue

- Statut : accepté
- Date : 2026-11-05

## Contexte

Le cahier technique (sections 7 et 8) exige qu'aucune modification n'arrive en production sans
tests au vert, avec une attention particulière aux règles d'argent et de planning. Le code est
écrit avec l'aide d'une IA : les tests sont le filet qui vérifie ce qu'elle produit.

## Décision

Cinq niveaux de tests, tous lancés par GitHub Actions à chaque pull request :

| Niveau       | Outil                            | Où                   | Commande                |
| ------------ | -------------------------------- | -------------------- | ----------------------- |
| Unitaire     | Vitest                           | `src/**/*.test.ts`   | `pnpm test`             |
| Composants   | Vitest + Testing Library + jsdom | `src/**/*.test.tsx`  | `pnpm test`             |
| Intégration  | Vitest + Testcontainers (PG 17)  | `tests/integration/` | `pnpm test:integration` |
| Bout en bout | Playwright + axe-core            | `tests/e2e/`         | `pnpm test:e2e`         |
| Visuel       | Playwright, captures comparées   | `tests/visual/`      | `pnpm test:visual`      |

Sécurité : `pnpm audit` (bloquant si faille critique) et gitleaks dans la CI, CodeQL dans un
workflow à part, Renovate pour les mises à jour. Le dépôt est public, ce qui rend gratuits
CodeQL et la protection de la branche `main`.

## Pourquoi

- **Vitest** plutôt que Jest : même configuration que les outils modernes (Vite), rapide,
  compatible TypeScript sans réglage.
- **Testing Library** teste ce que voit l'utilisateur (rôles, textes), ce qui pousse aussi à
  écrire des écrans accessibles.
- **Testcontainers** lance un vrai PostgreSQL 17 : les politiques RLS et les contraintes ne
  peuvent pas être testées avec une fausse base.
- **Playwright** couvre Chromium (ordinateur : référents, administrateurs) et WebKit sur iPhone
  (mobile : familles, producteurs). **axe-core** détecte automatiquement une partie des défauts
  d'accessibilité ; la recette manuelle (NVDA, VoiceOver) reste nécessaire.
- **Captures produites en CI seulement** : le rendu des polices diffère entre le poste (WSL) et
  les serveurs de GitHub. Les références sont donc générées par le workflow « Mettre à jour les
  captures », dans le même environnement que la CI, puis commitées.

## Conséquences

- Docker doit tourner sur le poste pour `pnpm test:integration`.
- Un changement d'écran voulu demande de relancer « Mettre à jour les captures » sur la branche,
  puis de relancer la CI (un commit fait par GitHub Actions ne relance pas la CI tout seul).
- La couverture du dossier `domain/` doit rester ≥ 90 %, sinon la CI échoue.
