# domain/ — règles métier

Le cœur de Pomme : calcul des chèques et des avoirs, statut d'adhésion, « Rien ce mois-ci »,
génération du planning des permanences, verrouillages à la réouverture des commandes…

Règles du dossier :

- **Aucune dépendance** à Next.js, React ou la base de données : des fonctions TypeScript pures,
  qui reçoivent des données et renvoient un résultat.
- **Chaque fonction est testée** (Vitest, fiche S2) ; objectif de couverture ≥ 90 %.
- Les montants sont des **entiers en centimes**, jamais des nombres à virgule.
