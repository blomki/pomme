# db/ — base de données

| Fichier ou dossier | Rôle                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| `schema/index.ts`  | tables, contraintes et politiques RLS (source de vérité)                    |
| `migrations/`      | migrations SQL produites par `pnpm db:generate` — ne pas modifier à la main |
| `client.ts`        | connexion (`getDatabase()` pour l'application, rôle `pomme_app`)            |
| `context.ts`       | `withAmapContext` : transaction avec AMAP et utilisateur courants (RLS)     |
| `setup.ts`         | création du rôle applicatif `pomme_app`                                     |
| `migrate.ts`       | application des migrations                                                  |
| `seed/`            | jeu de données fictif, reproductible                                        |
| `uuid.ts`          | identifiants UUID v7                                                        |
| `scripts/`         | commandes `pnpm db:*`                                                       |

Ajouter une table : la déclarer dans `schema/index.ts` avec son `amap_id` et ses politiques
(`pgPolicy`), lancer `pnpm db:generate`, relire le SQL produit, ajouter les tests d'isolation dans
`tests/integration/`. Voir [ADR 0003](../../docs/adr/0003-isolation-par-amap-rls.md).
