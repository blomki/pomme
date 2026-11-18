# 0016. AMAP courante du producteur

- Statut : accepté
- Date : 2026-11-18

## Contexte

Story C4 : un producteur qui livre plusieurs AMAP choisit son « AMAP courante » sur l'accueil
de son espace (écran P1). Le choix doit être mémorisé côté serveur, pour le retrouver sur un
autre appareil, et l'espace prend les couleurs et la police des titres de cette AMAP.

Jusqu'ici (C2), le catalogue du producteur montrait un onglet par AMAP, avec l'AMAP dans
l'adresse (`?amap=…`), et l'espace gardait le thème de la plateforme.

## Décision

1. **Le choix est une colonne du compte** : `user.current_amap_producer_id`, le lien
   producteur–AMAP choisi (pas seulement l'AMAP : un compte peut, rarement, être lié à deux
   producteurs). Clé étrangère `on delete set null`.
2. **Le serveur ne fait jamais confiance au choix enregistré** : à chaque lecture, l'AMAP
   courante est celle choisie si elle figure encore dans la liste du producteur
   (`list_my_producer_amaps`), sinon la première (`pickCurrentAmap`). À l'écriture, seul un
   lien de sa liste est accepté.
3. **Tout l'espace producteur suit l'AMAP courante** : thème dans la mise en page, catalogue,
   puis à venir « À préparer » et « Paiements ». Les onglets par AMAP du catalogue
   disparaissent ; le nom de l'AMAP y est rappelé quand il y en a plusieurs.
4. **L'accueil met en avant une seule action datée** : publier le catalogue du mois de la
   première période de commande pas encore clôturée (ou du mois prochain, sans date, si l'admin
   n'a pas encore fixé la période).
5. **Pas de logo pour l'instant** : en attendant l'envoi de fichiers (S11), les initiales de
   l'AMAP en tiennent lieu.

## Pourquoi

- Une colonne plutôt qu'un cookie : le choix suit le compte d'un appareil à l'autre (critère
  de la story). Plutôt qu'une table de préférences : un seul réglage, sans autre besoin connu.
- Le compte modifie sa propre ligne : la politique `user_update` existante suffit, sans
  nouvelle fonction SECURITY DEFINER.
- Vérifier le choix à la lecture évite une page cassée quand un producteur cesse de livrer une
  AMAP (lien inactif ou archivé).
- Une seule façon de changer d'AMAP (l'accueil) évite deux sélecteurs qui se contredisent.

## Conséquences

- Les mises en page de l'espace producteur demandent une connexion : la capture de référence
  de `/producteur` (prise sans compte) est retirée des tests visuels.
- Changer d'AMAP recharge tout l'espace (`revalidatePath("/producteur", "layout")`).
- Les écrans E5 (À préparer) et F4 (Paiements) liront l'AMAP courante avec
  `requireProducerPage()`.
