# 0008. Hébergement chez Clever Cloud, sécurité HTTP et déploiement

- Statut : accepté (rôles PostgreSQL : accordés par le support le 2026-11-16, plans payants)
- Date : 2026-11-14

## Contexte

Le cahier technique (section 8) prévoit Clever Cloud : application Node.js, PostgreSQL géré,
stockage Cellar, budget de moins de 20 € par mois.

Une difficulté : l'isolation entre AMAP (ADR 0003) demande trois rôles PostgreSQL, le
propriétaire des tables (migrations), `pomme_app` (l'application) et `pomme_auth`
(Better Auth). Ces deux derniers ne possèdent pas les tables : ils ne peuvent ni désactiver ni
contourner la Row Level Security. Or la base gérée de Clever Cloud ne donne par défaut qu'un
utilisateur, propriétaire de tout ; la doc invite à contacter le support pour aller plus loin.

## Décision

1. **Tout chez Clever Cloud**, région Paris :
   - `pomme-prod` : application Node.js nano, base PostgreSQL **XXS Small Space** (sauvegardes
     quotidiennes gardées 7 jours) ;
   - `pomme-preprod` : application nano, base PostgreSQL **XXS Small Space** elle aussi
     (données fictives seulement) : le plan DEV, gratuit, ne permet pas les rôles (point 2) ;
   - une seule instance par application : les limites de débit sont gardées en mémoire.
2. **Rôles PostgreSQL** : le support de Clever Cloud accorde `CREATEROLE` au propriétaire de
   chaque base, et active l'option « dump all » pour que les rôles soient conservés si la base
   est migrée (réponse du 2026-11-16). **Seulement sur les plans payants**, pas sur le plan
   DEV. `pnpm db:setup` crée alors `pomme_app` et `pomme_auth` comme en local. Le
   propriétaire n'a ni `SUPERUSER` ni `CREATEDB` : le script n'écrit aucun de ces attributs
   (PostgreSQL 16+ le refuserait), il vérifie seulement que les rôles applicatifs ne les ont
   pas. Les tests d'intégration simulent ce propriétaire exactement.
3. **Au démarrage** (`clevercloud/pre-run.sh`, première instance seulement) : `pnpm db:setup`
   puis `pnpm db:migrate`. Clever Cloud ne bascule sur la nouvelle version que si
   `/api/health` répond 200 (application et base joignables).
4. **Déploiement depuis GitHub Actions**, jamais directement depuis Clever Cloud :
   pré-production après chaque CI au vert sur `main` ; production par un bouton (workflow
   manuel, approbation obligatoire), seulement pour une version déjà déployée en
   pré-production.
5. **En-têtes de sécurité** sur toutes les réponses (`next.config.ts`) et
   **Content-Security-Policy avec nonce** sur chaque page (`src/proxy.ts`), voir
   `src/server/security-headers.ts`.

## Pourquoi

- Un seul fournisseur français : environ 6 € par application et 5 € par base, soit environ
  22 € par mois, un peu au-dessus de l'objectif de 20 € (à confirmer sur la facture).
- Pré-production en plan payant plutôt que DEV : sept migrations citent les rôles
  `pomme_app` et `pomme_auth`, que PostgreSQL refuse s'ils n'existent pas ; sur le plan DEV,
  personne ne peut les créer. Une pré-production sans ces rôles serait impossible, et de toute
  façon inutile pour tester l'isolation entre AMAP.
- Scaleway a été étudié pour sa base gérée, qui permet de créer des rôles : la région Paris
  n'était pas ouverte sur un compte neuf et le coût dépassait 30 € par mois.
- Se connecter en propriétaire avec `FORCE ROW LEVEL SECURITY` est écarté : le propriétaire
  peut désactiver la RLS d'une simple commande, et Better Auth ne serait plus isolé.
- Déployer depuis GitHub Actions garantit que seul du code passé par la CI part en ligne.
- Toutes les pages sont construites à la demande : c'est le prix du nonce (Next.js ne peut pas
  l'ajouter à une page construite d'avance). Pour 40 foyers, sans conséquence.
- `style-src 'unsafe-inline'` : MUI écrit des styles en attribut, qu'un nonce ne couvre pas. Un
  style injecté ne peut pas exécuter de code ; les scripts restent strictement contrôlés.

## Conséquences

- Chaque nouvelle base (nouvel environnement) doit être en plan payant,
  avec une demande au support pour `CREATEROLE` et « dump all ».
- Adresse IP des visiteurs (limites de débit) : la dernière de `X-Forwarded-For`, ajoutée par
  le répartiteur de Clever Cloud ; la première peut être inventée
  (`src/server/auth/client-ip.ts`).
- Les migrations doivent rester compatibles avec la version précédente : pendant un
  déploiement, l'ancienne version tourne sur la base déjà migrée.
- Une nouvelle origine externe (par exemple Sentry) devra être ajoutée à la CSP.
- Pas d'environnement de prévisualisation par pull request (décision du 2026-11-16) : chaque
  PR demanderait sa propre base payante, car ses migrations ne doivent pas toucher la
  pré-production. La CI teste déjà chaque PR sur un build de production avec une vraie base ;
  au besoin, le responsable du projet essaie la branche en local avant la fusion.
- Surveillance (Sentry, sonde, journaux) : ADR 0014. Reste à faire : le domaine de production
  (voir `docs/deploiement.md`).
