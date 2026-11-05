# tests/ — tests hors du dossier src/

| Dossier        | Contenu                                                            | Commande                |
| -------------- | ------------------------------------------------------------------ | ----------------------- |
| `setup/`       | préparation des tests de composants (`renderWithIntl`…)            | —                       |
| `integration/` | tests avec un vrai PostgreSQL dans Docker (Testcontainers)         | `pnpm test:integration` |
| `e2e/`         | parcours dans Chromium et WebKit mobile, avec contrôle axe-core    | `pnpm test:e2e`         |
| `visual/`      | captures d'écran comparées aux références (`__screenshots__/`), CI | `pnpm test:visual`      |

Les tests unitaires et de composants sont à côté du code qu'ils testent, dans `src/`
(`amap-slug.ts` → `amap-slug.test.ts`).
