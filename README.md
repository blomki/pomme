# Pomme

Application de création et de gestion d'AMAP : commandes mensuelles, chèques et avoirs,
permanences, pages publiques. Première AMAP : Cambremer (`[domaine]/hommesdeterre`).

## Prérequis

- [Node.js 24 LTS](https://nodejs.org/) (voir `.nvmrc`)
- pnpm : `corepack enable` (la version est fixée dans `package.json`)

## Démarrer

```bash
pnpm install   # installe les dépendances et le contrôle des messages de commit
pnpm dev       # http://localhost:3000
```

## Commandes utiles

| Commande          | Rôle                                           |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | serveur de développement                       |
| `pnpm build`      | build de production                            |
| `pnpm check`      | types + ESLint + mise en forme (avant une PR)  |
| `pnpm lint:fix`   | corrige ce qu'ESLint peut corriger seul        |
| `pnpm format`     | met en forme tout le code avec Prettier        |

## Organisation

```
src/
  app/
    (public)/            pages publiques : accueil, [amap] (page de l'AMAP)
    (app)/[amap]/        espaces connectés d'une AMAP : famille, referent, admin
    (app)/producteur/    espace producteur (toutes ses AMAP)
    (app)/plateforme/    gestion de la plateforme
  domain/                règles métier, sans Next.js ni base (testées en priorité)
  server/                Server Actions, contrôle des rôles
  db/                    schéma, migrations, RLS
  ui/                    thème et composants partagés
  i18n/                  textes (messages/fr.json), dates
tests/e2e/               tests de bout en bout
docs/adr/                décisions d'architecture
```

Conventions : voir [`CLAUDE.md`](CLAUDE.md). Décisions : [`docs/adr/`](docs/adr/).
