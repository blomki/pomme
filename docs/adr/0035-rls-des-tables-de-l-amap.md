# 0035. Row Level Security des tables de l'AMAP

- Statut : accepté
- Date : 2026-11-21

## Contexte

L'ADR 0003 fait de la Row Level Security (RLS) le deuxième rempart : même si le code oubliait
un contrôle, la base refuserait. Les premières tables (foyers, membres, rôles, distributions…)
n'avaient pourtant qu'une politique « même AMAP », en lecture comme en écriture. Toute
connexion dans le contexte d'une AMAP pouvait donc, au niveau de la base, lire et modifier
ces lignes :

- un visiteur anonyme : site public (H2), formulaire d'adhésion (B2) ;
- une famille ;
- un producteur.

Seuls les contrôles de l'application (`requireRole`) l'empêchaient. Relevé pendant S12 (ADR 0021) pour les foyers ; étendu ici à toutes les tables concernées (story S13).

## Décision

Une condition par opération (fonction `scopedPolicies`), toujours en plus de « dans l'AMAP
courante » ; une opération sans politique est refusée.

| Table                 | Lecture                                                                                                                                                     | Écriture                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `household`           | ses membres ; l'équipe (admins, référents) ; le producteur, pour les foyers qui lui ont commandé ou dont il attend un chèque ; les accès de confiance (S12) | admins                                                     |
| `household_member`    | soi-même ; les membres de son foyer ; l'équipe ; les accès de confiance                                                                                     | admins                                                     |
| `membership`          | le foyer ; l'équipe ; les accès de confiance                                                                                                                | admins                                                     |
| `amap_role`           | toute l'AMAP (qui est admin, qui est référent)                                                                                                              | admins                                                     |
| `amap`                | tout le monde (site public)                                                                                                                                 | admins de cette AMAP ; création par `create_amap`          |
| `distribution`        | toute l'AMAP, visiteurs compris                                                                                                                             | admins                                                     |
| `order_period`        | toute l'AMAP                                                                                                                                                | admins ; tâche horaire (`closing_job`)                     |
| `amap_producer`       | toute l'AMAP, visiteurs compris                                                                                                                             | admins ; le référent du producteur (ordre des chèques, C1) |
| `referent_assignment` | toute l'AMAP (les autres politiques s'en servent)                                                                                                           | admins                                                     |

Jamais de lecture des foyers, membres ou adhésions par un visiteur anonyme.

**« Les membres de mon foyer »** : une politique de `household_member` ne peut pas interroger
`household_member` elle-même (PostgreSQL refuse la récursion). Une fonction de base,
`my_household_ids()` (migration 0036, `SECURITY DEFINER`), renvoie les seuls foyers de la
personne connectée.

**Piège évité** : dans une politique de `amap_producer`, une sous-requête qui joint aussi
`amap_producer` y désigne sa propre table, pas la ligne vérifiée. La condition « référent de
ce producteur » compare donc directement `referent_assignment.amap_producer_id` à
l'identifiant de la ligne. Le test l'a montré : sans cela, un référent pouvait modifier
l'ordre des chèques de n'importe quel producteur.

## Pourquoi

- La base doit tenir seule : un oubli de `requireRole`, ou une future route publique, ne doit
  pas exposer les noms des familles ni permettre de se donner un rôle.
- Des conditions par opération, écrites au même endroit que la table, se relisent et se
  testent table par table.

## Conséquences

- Chaque nouvelle table suit ce modèle : lecture et écriture précisées pour chaque profil,
  avec un test direct dans la base (`tests/integration/rls-tables-amap.test.ts`).
- Une future écriture par une famille (profil et membres de son foyer, A3) demandera une
  politique dédiée.
