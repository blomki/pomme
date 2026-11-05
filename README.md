# Pomme

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

À partir de la fiche S3, la base de données et la capture des emails tournent dans Docker :
installer Docker Desktop sous Windows et activer l'intégration WSL
(_Settings › Resources › WSL integration_).

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

## Vérifier avant une pull request

```bash
pnpm format   # met en forme tout le code
pnpm check    # types + ESLint + mise en forme
pnpm build    # build de production
```

Les trois doivent passer sans erreur.

## Toutes les commandes

| Commande            | Rôle                                                |
| ------------------- | --------------------------------------------------- |
| `pnpm install`      | installe les dépendances et le contrôle des commits |
| `pnpm dev`          | serveur de développement (http://localhost:3000)    |
| `pnpm build`        | build de production                                 |
| `pnpm start`        | lance le build de production (après `pnpm build`)   |
| `pnpm check`        | types + ESLint + mise en forme, sans rien modifier  |
| `pnpm typecheck`    | vérifie les types TypeScript seulement              |
| `pnpm lint`         | lance ESLint seulement                              |
| `pnpm lint:fix`     | corrige ce qu'ESLint peut corriger seul             |
| `pnpm format`       | met en forme tout le code avec Prettier             |
| `pnpm format:check` | vérifie la mise en forme sans rien modifier         |

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
tests/e2e/               tests de bout en bout
docs/adr/                décisions d'architecture
```

Conventions : voir [`CLAUDE.md`](CLAUDE.md). Décisions : [`docs/adr/`](docs/adr/).
