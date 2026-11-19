# 0021. Commandes, lignes et chèques isolés par foyer dans la base

- Statut : accepté
- Date : 2026-11-19

## Contexte

Jusqu'ici, la Row Level Security (ADR 0003) isolait les commandes (`order`, `order_line`) et
les chèques (`cheque`) par AMAP seulement. Le code serveur limitait une famille à son propre
foyer, mais une erreur dans une future lecture aurait pu montrer la commande d'un autre foyer.
Deux accès se font sans compte connecté et doivent continuer de marcher : la tâche horaire qui
clôture les commandes et calcule les chèques (ADR 0015), et la page du bon de commande ouverte
par le lien signé envoyé au producteur (ADR 0019). Les visiteurs anonymes des pages publiques,
eux aussi sans compte, ne doivent rien voir (fiche S12).

## Décision

1. **Qui voit et qui écrit**, dans l'AMAP courante :

   |                                               | Commande et lignes          | Chèques                   |
   | --------------------------------------------- | --------------------------- | ------------------------- |
   | Membre (non archivé) du foyer                 | lit, écrit                  | lit                       |
   | Admin de l'AMAP                               | lit, écrit                  | lit, écrit                |
   | Référent du producteur                        | lit, écrit (correction, D7) | lit, écrit (pointage, F1) |
   | Compte du producteur                          | lit                         | lit                       |
   | Lien signé du bon de commande                 | lit                         | lit                       |
   | Tâche horaire de clôture                      | lit                         | lit, écrit                |
   | Visiteur anonyme, autre référent, autre foyer | rien                        | rien                      |

   Le producteur d'une commande est celui de son catalogue ; une ligne suit les droits de sa
   commande. Les chèques ne sont jamais écrits par les familles.

2. **Un accès « de confiance » explicite** pour les deux cas sans compte : une troisième variable
   de transaction, `app.trusted`, à côté de `app.amap_id` et `app.user_id`. `withAmapContext`
   la pose depuis `ctx.trusted` : `closing_job` pour la tâche horaire, `order_form_link` pour la
   page du lien signé, après vérification de la signature. Sans elle, une personne non connectée
   ne voit aucune commande.
3. Les politiques sont décrites dans le schéma Drizzle (`orderPolicies`,
   `src/db/schema/index.ts`) et générées en migration, comme les autres.

## Pourquoi

- Une deuxième barrière, dans la base : même si une lecture oublie de filtrer par foyer, la base
  ne renvoie que ce que la personne a le droit de voir.
- Écarté : des fonctions PostgreSQL « security definer » pour la tâche horaire et le lien
  signé. Elles contournent la RLS et obligent à réécrire en SQL les lectures déjà écrites avec
  Drizzle. Une variable posée par le code serveur garde les mêmes lectures, et la RLS reste
  active (toujours limitée à l'AMAP).
- La variable n'est pas un secret : elle protège contre une erreur de code (une page publique
  qui lirait des commandes par mégarde), pas contre quelqu'un qui pourrait déjà exécuter du SQL
  avec le rôle de l'application. Elle n'est posée qu'à deux endroits, faciles à relire.
- Le lien signé lit toutes les commandes de l'AMAP, pas seulement celles du producteur du lien :
  la page ne lit que ce producteur, et limiter davantage demanderait une variable de plus pour
  un gain faible.

## Conséquences

- Toute nouvelle lecture de commandes sans compte connecté devra poser un accès de confiance,
  ajouté à `TrustedAccess` et à cet ADR.
- Le test `tests/integration/order-isolation.test.ts` vérifie chaque ligne du tableau.
- Restent visibles de toute personne dans l'AMAP, y compris un visiteur anonyme : les foyers et
  leurs membres (`household`, `household_member`), filtrés par AMAP seulement. C'est hors de
  cette fiche ; à traiter dans une fiche à part.
