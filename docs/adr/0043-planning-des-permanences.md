# 0043. Planning des permanences du trimestre

- Statut : accepté
- Date : 2026-11-22

## Contexte

Chaque distribution a besoin de bénévoles (3 par défaut, réglage de l'AMAP). Une fois les
indisponibilités recueillies (story G1, ADR 0042), l'admin doit pouvoir générer le planning du
trimestre, l'ajuster, l'envoyer, puis le modifier en prévenant ou non les personnes concernées
(story G2). Règles du cahier des charges :

- répartition équitable du nombre de permanences ;
- chaque nouveau (moins de 6 permanences faites, antériorité AmapJ comprise) accompagné d'au
  moins un expérimenté ;
- indisponibilités respectées ; sans réponse, disponible partout ;
- mois passés en lecture seule.

## Décision

1. Tables du modèle de données (section 8) :
   - `duty_slot` : une personne de permanence à une distribution, à une place (1, 2, 3…) ;
     lisible par toute l'AMAP (les noms sont affichés et imprimés), modifiable par les admins ;
   - `duty_history` : permanences faites avant Pomme (`imported_count`, rempli par l'import
     AmapJ, story K1), lisible par la personne et les admins.
     L'expérience d'une personne = `imported_count` + ses permanences passées dans Pomme.
2. **Génération** (`domain/duty-planning.ts`, fonction pure), distribution par distribution :
   d'abord l'expérimenté disponible le moins chargé, puis les personnes disponibles les moins
   chargées. À charge égale, un nouveau passe avant un expérimenté. Départage : la dernière
   permanence la plus ancienne, puis le nom. Les mois passés ne sont jamais regénérés ; leurs
   permanences comptent dans la charge.
3. **États** de `duty_plan` : `collecting` (réponses), `draft` (planning généré, personne
   n'est prévenu), `sent` (envoyé : chaque bénévole a reçu ses dates). Après l'envoi, on ne
   regénère plus : on ajuste case par case.
4. **Prévenir** : à l'enregistrement d'un planning envoyé, les personnes concernées (ajoutées
   ou retirées d'une distribution, pas celles qui changent seulement de place) sont prévenues
   tout de suite (case cochée), ou ajoutées à `duty_plan.pending_notice` : bandeau
   « Changements enregistrés sans prévenir » et bouton « Prévenir maintenant ».
5. Écrans : bandeau « Prochain trimestre » sur « Planning des permanences » (réponses, état du
   planning, « Voir les réponses ») ; éditeur `/<amap>/admin/planning/permanences`
   (trimestre en cours ou prochain, un onglet par mois, une liste par place, contrôle par
   ligne, pastilles de répartition).
6. La génération est proposée à tout moment ; avant la date limite des réponses, un message
   rappelle qu'il faudra regénérer pour tenir compte des dernières réponses. Les amapiens
   peuvent répondre jusqu'à la date limite tant que le planning n'est pas envoyé.

## Pourquoi

- **Personnes à prévenir sur le planning, pas sur la case.** Le modèle de données prévoyait
  `duty_slot.changed_since_notice`. Mais une personne **retirée** d'une distribution n'a plus de
  case, et c'est elle qui doit le plus être prévenue. La liste est donc gardée sur le planning.
- **Nouveau avant expérimenté à charge égale** : les expérimentés sont souvent peu nombreux.
  Sans cette règle, deux expérimentés pouvaient se retrouver la même semaine, et l'un d'eux
  devait ensuite revenir plus souvent que les autres (vu en test : 3 permanences pour l'un,
  1 pour un autre, au lieu de 2 chacun).
- **Une règle simple et prévisible** plutôt qu'une optimisation : l'admin comprend pourquoi
  une personne est placée, et ajuste à la main ce qui ne convient pas ; les contrôles par ligne
  signalent ce qui enfreint une règle.
- **Une personne une seule fois par distribution** : garanti par la base (contrainte unique).

## Conséquences

- La consultation du calendrier par les amapiens (G3, #41) lira `duty_slot`.
- La feuille d'émargement (E3) pourra imprimer les noms des bénévoles.
- L'import AmapJ (K1) remplira `duty_history`.
