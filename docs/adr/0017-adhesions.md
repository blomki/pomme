# 0017. Adhésions : jours inclus, statut calculé, chevauchement refusé par la base

- Statut : accepté
- Date : 2026-11-18

## Contexte

Story B1 : l'admin saisit pour chaque foyer les dates de début et de fin d'adhésion
(cotisation facultative, note) et voit son statut : active, expire bientôt, expirée. Un foyer
sans adhésion active ne peut pas commander (story D3). Le modèle de données demande qu'un même
foyer n'ait pas deux adhésions qui se chevauchent.

## Décision

1. **Jours de début et de fin inclus** (`date`, sans heure), comme les périodes de commande
   (ADR 0015) : adhérent « jusqu'au 31 décembre » veut dire ce jour-là compris, à l'heure de
   Paris.
2. **Statut calculé, jamais enregistré** (`membershipState`, `src/domain/memberships.ts`).
   Cinq valeurs, deux de plus que la fiche pour couvrir tous les cas :
   - active ;
   - expire bientôt : se termine dans moins de N jours (réglage de l'AMAP, 30 par défaut) ;
   - à venir : aucune en cours, une commencera plus tard ;
   - expirée ;
   - aucune : jamais d'adhésion.

   Une adhésion suivie d'une autre qui commence dès le lendemain n'« expire » pas : on regarde
   la fin de la couverture continue. Un renouvellement fait à temps éteint donc l'alerte.

3. **Chevauchement refusé par la base** : contrainte d'exclusion
   `membership_no_overlap` (`EXCLUDE USING gist`, foyer égal et périodes qui se recouvrent),
   sur les adhésions non archivées. Elle demande l'extension `btree_gist`. Migration écrite à la
   main (`--custom`), comme le prévoit l'ADR 0009 pour ce que Drizzle ne sait pas décrire.
4. **Archiver plutôt que supprimer** : une adhésion saisie par erreur est archivée, ce qui
   libère ses dates. « Annuler » la saisit de nouveau.
5. **Journal** : chaque ajout, modification ou archivage est écrit dans `audit_log` (la
   cotisation est une donnée financière).
6. **Contrôle pour la commande** : `hasActiveMembership(tx, householdId, now)`, à appeler par
   l'action d'enregistrement de la commande (D3).
7. **Propositions de dates** : un an, à la suite de la dernière adhésion si elle n'est pas
   terminée, sinon à partir d'aujourd'hui.

## Pourquoi

- Un contrôle dans l'application seule laisserait passer deux enregistrements simultanés ; la
  contrainte de la base, non. C'est aussi ce que demande le modèle de données.
- `btree_gist` est une extension « de confiance » depuis PostgreSQL 13 : le propriétaire de la
  base peut l'installer sans être superutilisateur, chez Clever Cloud comme en local.
- Un statut enregistré deviendrait faux le lendemain sans tâche planifiée ; calculé, il est
  toujours juste.

## Conséquences

- Si une base refusait l'extension, la migration 0023 échouerait au déploiement (l'ancienne
  version resterait en ligne). Repli possible : un déclencheur qui vérifie le chevauchement.
- Le filtre de la liste des foyers se fait après calcul du statut, en mémoire : quelques
  centaines de foyers par AMAP au plus.
