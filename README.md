# Pomme

[![CI](https://github.com/blomki/pomme/actions/workflows/ci.yml/badge.svg)](https://github.com/blomki/pomme/actions/workflows/ci.yml)

Application de création et de gestion d'AMAP : commandes mensuelles, chèques et avoirs,
permanences, pages publiques. Première AMAP : Cambremer (`[domaine]/hommesdeterre`).

## Installer le poste de développement (Windows + WSL)

Le projet se développe dans WSL (Ubuntu), avec VS Code. Le code vit dans le système de fichiers
de WSL (par exemple `~/Documents/code/pomme`), pas dans `/mnt/c/…` : c'est bien plus rapide.

1. Dans VS Code, installer l'extension **WSL** (Microsoft).
2. Dans un terminal WSL, installer Node.js 24 avec nvm, puis activer pnpm :

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   # fermer puis rouvrir le terminal
   nvm install 24
   corepack enable   # active pnpm, dans la version fixée par package.json
   ```

3. Récupérer le projet et l'ouvrir dans VS Code :

   ```bash
   mkdir -p ~/Documents/code && cd ~/Documents/code
   git clone https://github.com/blomki/pomme.git
   cd pomme
   code .            # ouvre VS Code connecté à WSL
   ```

4. Accepter les extensions recommandées que propose VS Code (ESLint, Prettier, EditorConfig).

5. Installer Docker Desktop sous Windows et activer l'intégration WSL
   (_Settings › Resources › WSL integration_). Docker sert aux tests d'intégration (PostgreSQL
   jetable) et, à partir de la fiche S3, à la base de développement.
6. Installer les navigateurs des tests de bout en bout (une fois, puis à chaque mise à jour de
   Playwright) :

   ```bash
   pnpm exec playwright install --with-deps chromium webkit
   ```

## Installer les dépendances

```bash
pnpm install
```

À relancer après chaque `git pull` qui modifie `package.json` ou `pnpm-lock.yaml`.
`pnpm-lock.yaml` fige les versions exactes : il est toujours commité.

## Afficher l'application

```bash
pnpm dev
```

Puis ouvrir http://localhost:3000 dans le navigateur Windows (WSL relaie `localhost`).
Chaque fichier enregistré s'affiche aussitôt. `Ctrl+C` dans le terminal arrête le serveur.

Pour voir la version de production (plus rapide, sans rechargement automatique) :

```bash
pnpm build
pnpm start
```

Pages disponibles pour l'instant :

| Adresse                                      | Page                     |
| -------------------------------------------- | ------------------------ |
| http://localhost:3000                        | accueil de la plateforme |
| http://localhost:3000/hommesdeterre          | page publique de l'AMAP  |
| http://localhost:3000/hommesdeterre/famille  | espace famille           |
| http://localhost:3000/hommesdeterre/referent | espace référent          |
| http://localhost:3000/hommesdeterre/admin    | administration de l'AMAP |
| http://localhost:3000/producteur             | espace producteur        |
| http://localhost:3000/plateforme             | gestion de la plateforme |

## Tester

```bash
pnpm test               # tests unitaires et de composants (quelques secondes)
pnpm test:watch         # les mêmes, relancés à chaque enregistrement
pnpm test:coverage      # avec la couverture ; rapport dans coverage/index.html
pnpm test:integration   # avec un vrai PostgreSQL (Docker doit tourner)
pnpm test:e2e           # parcours dans Chromium et Safari mobile, avec contrôle d'accessibilité
```

Après `pnpm test:e2e`, `pnpm exec playwright show-report` ouvre le rapport détaillé.

Les captures d'écran comparées (`pnpm test:visual`) tournent seulement dans la CI : le rendu des
polices diffère entre WSL et les serveurs de GitHub. Quand un écran change volontairement :
onglet **Actions** › **Mettre à jour les captures** › **Run workflow** › choisir la branche ; puis
relancer la CI de la pull request (**Re-run jobs**).

## Vérifier avant une pull request

```bash
pnpm format             # met en forme tout le code
pnpm check              # types + ESLint + mise en forme
pnpm test:coverage      # tests, couverture ≥ 90 % sur domain/
pnpm build              # build de production
pnpm test:e2e           # bout en bout et accessibilité
```

Tout doit passer sans erreur. La CI (GitHub Actions) refait ces vérifications sur chaque pull
request, plus les tests d'intégration, les captures, l'audit des dépendances, la recherche de
secrets et CodeQL. La fusion dans `main` n'est possible que si tout est au vert.

## Toutes les commandes

| Commande                | Rôle                                                |
| ----------------------- | --------------------------------------------------- |
| `pnpm install`          | installe les dépendances et le contrôle des commits |
| `pnpm dev`              | serveur de développement (http://localhost:3000)    |
| `pnpm build`            | build de production                                 |
| `pnpm start`            | lance le build de production (après `pnpm build`)   |
| `pnpm check`            | types + ESLint + mise en forme, sans rien modifier  |
| `pnpm typecheck`        | vérifie les types TypeScript seulement              |
| `pnpm lint`             | lance ESLint seulement                              |
| `pnpm lint:fix`         | corrige ce qu'ESLint peut corriger seul             |
| `pnpm format`           | met en forme tout le code avec Prettier             |
| `pnpm format:check`     | vérifie la mise en forme sans rien modifier         |
| `pnpm test`             | tests unitaires et de composants                    |
| `pnpm test:watch`       | les mêmes, en continu                               |
| `pnpm test:coverage`    | les mêmes, avec la couverture                       |
| `pnpm test:integration` | tests avec PostgreSQL (Docker)                      |
| `pnpm test:e2e`         | bout en bout et accessibilité                       |
| `pnpm test:visual`      | captures comparées (CI seulement)                   |

## Travailler avec Git

Une branche par fiche du backlog, une pull request pour fusionner dans `main`.

```bash
git switch main && git pull                 # partir de la dernière version
git switch -c c2-fiches-produit             # créer la branche de la fiche
# … coder, puis :
git add -A
git commit -m "feat(catalogue): fiche produit"
git push -u origin c2-fiches-produit        # puis ouvrir la pull request sur GitHub
```

Pour récupérer une branche préparée par Claude :

```bash
git fetch
git switch s1-init-nextjs
git pull
```

Les messages de commit suivent la convention `type(portée): description`
(`feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`). Un message mal formé est refusé
au moment du commit.

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
tests/                   intégration, bout en bout, captures (voir tests/README.md)
docs/adr/                décisions d'architecture
.github/workflows/       intégration continue (CI, CodeQL, captures)
```

Conventions : voir [`CLAUDE.md`](CLAUDE.md). Décisions : [`docs/adr/`](docs/adr/).
