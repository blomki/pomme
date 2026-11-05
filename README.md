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

   Pour que les commits faits depuis VS Code trouvent aussi `pnpm` (contrôle des messages de
   commit), indiquer à husky de charger nvm avant chaque vérification :

   ```bash
   mkdir -p ~/.config/husky
   printf 'export NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n' > ~/.config/husky/init.sh
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
   (_Settings › Resources › WSL integration_), ainsi que _Settings › General › Start Docker
   Desktop when you sign in_. Docker fait tourner la base de développement et les bases jetables
   des tests d'intégration.
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

## Base de données

PostgreSQL 17 tourne dans Docker (Docker Desktop doit être lancé). Première installation :

```bash
cp .env.example .env   # adresses de connexion locales (jamais commité)
pnpm db:up             # démarre PostgreSQL
pnpm db:setup          # crée le rôle de l'application (pomme_app)
pnpm db:migrate        # crée les tables
pnpm db:seed           # charge le jeu de données fictif
```

Ensuite, `pnpm db:up` suffit après un redémarrage. `pnpm db:reset` efface tout et recommence
(utile après un changement de schéma ou pour retrouver des données propres).

Modifier le schéma : changer `src/db/schema/index.ts`, puis `pnpm db:generate` produit la
migration SQL dans `src/db/migrations/` (à relire et commiter), et `pnpm db:migrate` l'applique.
`pnpm db:studio` ouvre un explorateur de la base dans le navigateur.

Sécurité : l'application se connecte avec un rôle restreint, soumis à la Row Level Security de
PostgreSQL, qui isole les données de chaque AMAP (voir [ADR 0003](docs/adr/0003-isolation-par-amap-rls.md)).

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

Pages disponibles pour l'instant (base démarrée et jeu de données chargé, voir plus haut) :

| Adresse                                              | Page                                     |
| ---------------------------------------------------- | ---------------------------------------- |
| http://localhost:3000                                | accueil de la plateforme                 |
| http://localhost:3000/hommesdeterre                  | page publique de l'AMAP de démonstration |
| http://localhost:3000/hommesdeterre/famille          | espace famille (mobile)                  |
| http://localhost:3000/hommesdeterre/referent         | espace référent (ordinateur)             |
| http://localhost:3000/hommesdeterre/admin            | administration de l'AMAP (ordinateur)    |
| http://localhost:3000/producteur                     | espace producteur (mobile)               |
| http://localhost:3000/plateforme                     | gestion de la plateforme                 |
| http://localhost:3000/plateforme/theme/hommesdeterre | démonstration du thème (développement)   |

Pour voir les pages mobiles comme sur un téléphone : outils de développement du navigateur
(F12), puis bouton « appareil mobile ».

## Tester

```bash
pnpm test               # tests unitaires et de composants (quelques secondes)
pnpm test:watch         # les mêmes, relancés à chaque enregistrement
pnpm test:coverage      # avec la couverture ; rapport dans coverage/index.html
pnpm test:integration   # avec un vrai PostgreSQL (Docker doit tourner)
pnpm test:e2e           # parcours dans Chromium et Safari mobile, avec contrôle d'accessibilité
                        # (base démarrée et jeu de données chargé : pnpm db:up, pnpm db:seed)
```

Après `pnpm test:e2e`, `pnpm exec playwright show-report` ouvre le rapport détaillé.

Les captures d'écran comparées (`pnpm test:visual`) tournent seulement dans la CI : le rendu des
polices diffère entre WSL et les serveurs de GitHub. Quand un écran change volontairement ou
qu'un écran est nouveau : ajouter l'étiquette **captures** à la pull request (les références sont
recalculées et commitées sur la branche), retirer l'étiquette, puis relancer la CI de la pull
request (**Re-run jobs**). Avant de valider, regarder les nouvelles images dans l'onglet
**Files changed**.

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
| `pnpm db:up`            | démarre PostgreSQL (Docker)                         |
| `pnpm db:down`          | arrête PostgreSQL                                   |
| `pnpm db:setup`         | crée le rôle de l'application                       |
| `pnpm db:generate`      | écrit la migration d'un changement de schéma        |
| `pnpm db:migrate`       | applique les migrations                             |
| `pnpm db:seed`          | charge le jeu de données fictif                     |
| `pnpm db:reset`         | efface la base et recharge tout                     |
| `pnpm db:studio`        | explorateur de la base                              |

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
