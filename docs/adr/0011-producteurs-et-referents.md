# 0011. Producteurs communs à la plateforme et référents

- Statut : accepté
- Date : 2026-11-15

## Contexte

Story C1. Le modèle de données (section 5) fait du producteur une fiche **commune** à toutes
les AMAP qu'il livre (nom, catégorie, descriptions, coordonnées, photo), et place ses réglages
propres à une AMAP (ordre des chèques, distance, actif) dans `amap_producer`. Chaque producteur
a, dans chaque AMAP, un ou plusieurs référents, qui doivent avoir le rôle référent.

Comme pour les comptes (ADR 0009), la Row Level Security cache à l'application les producteurs
des autres AMAP : impossible de les retrouver pour les « rattacher ».

## Décision

1. **Tables** `producer` (commune, sans `amap_id`), `amap_producer` et `referent_assignment`
   (avec `amap_id`, que le modèle ne prévoyait pas, et une clé étrangère composée qui garantit
   que l'affectation et le producteur sont dans la même AMAP).
2. **Lecture d'un producteur** : seulement s'il livre l'AMAP courante. **Création et
   modification** : un admin de l'AMAP courante, et pour la modification seulement un
   producteur de cette AMAP.
3. **Rattacher un producteur existant** : fonction `search_producers` (`SECURITY DEFINER`,
   migration 0011), réservée aux admins de l'AMAP courante, qui ne renvoie que l'identifiant, le
   nom et la catégorie (jamais les coordonnées), au plus 10 résultats, à partir de 2 caractères.
4. **Référents** : seules les personnes qui ont le rôle référent dans l'AMAP peuvent être
   affectées (vérifié par l'application). **Retirer le rôle référent est refusé** tant que la
   personne suit des producteurs. Les affectations sont journalisées (avant / après), comme
   l'ordre des chèques.
5. **Tâche « Bloquant »** : un producteur actif sans référent est signalé dans la liste et sur
   le tableau de bord de l'admin ; la tâche disparaît d'elle-même une fois un référent affecté.
6. **Anonymisation d'un foyer** (ADR 0010) : les affectations de référent de ses membres sont
   retirées avec leurs rôles (migration 0012) ; le producteur devient « sans référent ».
7. **Photo** : la colonne existe, l'envoi de fichiers viendra avec une fiche dédiée (stockage
   objet, images ré-encodées), commune aux photos de producteurs, de produits et aux logos.

## Pourquoi

- Une seule fiche par producteur : il met à jour ses coordonnées une fois pour toutes ses AMAP
  (partie 2 de C1, comptes producteurs), et on évite les doublons.
- Recherche sans coordonnées : savoir qu'un producteur existe suffit pour le rattacher ; ses
  coordonnées s'affichent une fois qu'il livre l'AMAP.
- Refuser le retrait du rôle : un producteur ne doit pas se retrouver sans référent par
  surprise. L'anonymisation, elle, est un droit de la personne : elle passe toujours.

## Conséquences

- **Un admin d'une AMAP modifie la fiche commune pour toutes les AMAP du producteur.** C'est
  annoncé dans l'écran (« Commune à toutes les AMAP que ce producteur livre »). Si cela pose
  problème, il faudra réserver ces champs au producteur lui-même (comptes producteurs).
- Partie 2 de C1 : `producer_user` (comptes producteurs), et la lecture d'un producteur par son
  propre compte. `anonymize_household` devra garder actif un compte lié à un producteur.
- Rattacher un producteur révèle à l'admin qu'il livre une autre AMAP (pas laquelle).
