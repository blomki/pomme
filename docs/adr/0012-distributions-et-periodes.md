# 0012. Distributions rattachées à leur mois, pas à leur période

- Statut : accepté
- Date : 2026-11-15

## Contexte

Story D1 : l'admin génère le calendrier hebdomadaire des distributions, puis ouvre ou ferme
chacune avec un motif. Le modèle de données (section 6) rattache chaque distribution à sa
période de commande (`distribution.order_period_id`). Mais le planning des permanences se fait
par trimestre (G2) : il faut les distributions des trois prochains mois avant que les périodes
de commande de ces mois existent (écart n°8 relevé le 2026-11-06).

## Décision

1. **Pas de lien direct** entre distribution et période : une distribution appartient à la
   période de son mois (une seule période par mois et par AMAP). Décision du porteur du
   projet, le 2026-11-15.
2. **Table `distribution`** : `amap_id`, `date` (jour du calendrier, sans heure ni fuseau),
   horaires, `is_open`, `closed_reason`. Une seule distribution par date et par AMAP.
   Contrainte en base : fermée ⇔ motif non vide.
3. **Distribution habituelle** (jour de la semaine, horaires) dans `amap.settings`, et lieu
   dans `amap.distribution_place` : les réglages d'A4 en avance, limités à ce dont D1 a besoin.
4. **Génération par mois**, le jour habituel : 4 ou 5 dates. Relancer ne crée jamais de
   doublon (les dates existantes sont laissées telles quelles). Changer la distribution
   habituelle ne modifie pas les distributions déjà créées.
5. Pas d'`archived_at` : une distribution ne se supprime pas, elle se ferme (avec motif) et se
   rouvre. Génération, fermeture et réouverture sont journalisées.

## Pourquoi

- Le mois suffit à relier une distribution à sa période, sans créer des périodes « vides »
  des mois à l'avance.
- Des dates sans heure ni fuseau : une distribution a lieu un jour donné, quel que soit le
  fuseau du serveur (UTC chez l'hébergeur) ; le calcul des jours se fait en UTC pur.
- La contrainte de motif utilise `coalesce` : sans lui, un motif NULL rendait la condition
  NULL, et PostgreSQL accepte une contrainte CHECK qui vaut NULL (trouvé par les tests).

## Conséquences

- D2 (périodes de commande) retrouvera les distributions d'une période par leur date.
- Les lignes de commande (D3) pointeront vers une distribution ; une distribution fermée ne
  pourra pas être commandée.
- Fermer une distribution qui a déjà des commandes devra être traité avec D3 (prévenir les
  familles, ajuster les chèques).
- Prix des commandes (décision du 2026-11-15, à appliquer dans D3) : chaque ligne garde le
  prix au moment où la famille commande ; un nouveau prix du catalogue ne touche pas les
  commandes déjà enregistrées. Le modèle figeait le prix à la clôture : un ADR suivra avec D3.
