# 0036. Sauvegardes externes et test de restauration

- Statut : accepté
- Date : 2026-11-21

## Contexte

Clever Cloud sauvegarde la base chaque jour (7 jours sur le plan actuel). Si le compte, le
fournisseur ou ses sauvegardes disparaissent, tout est perdu. Le cahier technique (section 6)
prévoit une copie chiffrée chez un second fournisseur, Scaleway (stockage seul, à Paris), et
un test de restauration automatique chaque mois (story S8).

## Décision

1. **Copie nocturne de la base** : `pg_dump` (format compressé « custom »), chiffré avec
   **age** sans passer par un fichier en clair, envoyé sur Scaleway Object Storage (Paris).
   30 copies quotidiennes (`daily/`, 31 jours) et 12 mensuelles (`monthly/`, la copie du 1er,
   366 jours).
2. **Copies non effaçables** : bucket avec Object Lock ; chaque copie est verrouillée en mode
   « compliance » jusqu'à sa date d'expiration. Les règles de cycle de vie du bucket les effacent
   ensuite.
3. **Deux clés de chiffrement** pour chaque copie (age accepte plusieurs destinataires) :
   - la clé **hors ligne**, gardée par deux personnes, pour un vrai incident ;
   - une clé **dédiée au test de restauration**, dans les secrets GitHub.
4. **Fichiers déposés** (Cellar) recopiés chaque nuit sous `files/`, avec les versions
   remplacées ou supprimées gardées 30 jours.
5. **Test de restauration** le 3 de chaque mois : la dernière copie quotidienne (de moins de
   36 heures) est déchiffrée, restaurée dans une base PostgreSQL jetable, puis vérifiée
   (au moins une AMAP, des foyers, des comptes).
6. **Exécution par GitHub Actions** (`.github/workflows/sauvegardes.yml`), et non par le cron de
   Clever Cloud comme l'envisageait le cahier technique. Les scripts tournent dans l'image
   `postgres:17-alpine`, même version que la production.
7. **Alerte** : un échec ouvre une issue « Sauvegarde » (email de GitHub), refermée au passage
   réussi suivant, sur le modèle de la sonde de disponibilité (ADR 0014).
8. **Procédure de reprise écrite** : `docs/reprise.md`, avec un exercice annuel à la main.

## Pourquoi

- **GitHub Actions plutôt que le cron de Clever Cloud** :
  - l'image de l'application n'a ni `pg_dump` dans la bonne version, ni age ;
  - GitHub garde un journal lisible de chaque passage et sait ouvrir une issue d'alerte ;
  - la sauvegarde ne dépend plus de l'instance qu'elle protège.
- **Une seconde clé pour le test** : déchiffrer est indispensable pour vérifier qu'une copie
  est restaurable. La CI détient déjà l'accès à la base pour la sauvegarder : cette clé ne lui
  donne rien de plus. La clé hors ligne, elle, ne quitte jamais ses deux gardiens.
- **Object Lock** : même avec les clés de Scaleway volées, personne ne peut effacer les
  sauvegardes (ransomware, erreur de manipulation).

## Conséquences

- La mise en place demande un compte Scaleway, deux paires de clés age et des secrets GitHub
  (docs/reprise.md). Tant que `BACKUP_ENABLED` n'est pas activé, le workflow ne fait rien.
- L'adresse de la base de production (compte propriétaire) est un secret GitHub.
- Les scripts ont été essayés en local (PostgreSQL et SeaweedFS de développement, sans Object
  Lock) : sauvegarde, refus avec une seule clé, restauration, déchiffrement par chacune des deux
  clés, copie des fichiers.
- Coût estimé : moins d'un euro par mois chez Scaleway pour quelques AMAP.
