# 0018. Commande du mois : saisie immédiate, « Rien ce mois-ci », validation sans statut

- Statut : accepté
- Date : 2026-11-18

## Contexte

Story D3 : l'amapien saisit une quantité par produit et par distribution, voit le total par
producteur en direct, et chaque saisie est enregistrée aussitôt. Les écrans montrent pour
chaque producteur « Complété », « À compléter » ou « Rien ce mois-ci », et un bouton
« Valider ma commande ». La table `order` n'a pas de statut (écart n°4 entre les documents).
Le porteur du projet a tranché le 2026-11-18.

## Décision

1. **« Rien ce mois-ci » est un choix explicite** du foyer, bouton sur la page du producteur
   (`order.declined_at`). Il compte comme « traité ». Tout à zéro sans ce choix reste « À
   compléter ». Il est refusé tant qu'il reste des quantités, et une quantité saisie l'annule.
2. **Pas de statut de commande.** La commande compte dès la première quantité. « Valider ma
   commande » vérifie qu'elle n'est pas vide et envoie l'email récapitulatif à la personne qui
   valide, une fois par personne et par mois (clé de dédoublonnage du journal des emails). La
   commande reste modifiable jusqu'à la clôture.
3. **Contrôles refaits par le serveur à chaque saisie** (`setOrderQuantity`) :
   - le compte a un foyer actif dans l'AMAP ;
   - la période est ouverte (l'heure fait foi, ADR 0015) ;
   - l'adhésion est en cours (ADR 0017) ;
   - le produit fait partie d'un catalogue publié du mois et il est disponible à cette
     distribution, qui est ouverte ;
   - la distribution n'est ni passée ni du jour même ;
   - le chèque du foyer chez ce producteur n'est pas encore pointé.

   Remettre à zéro une case devenue indisponible reste permis.

4. **Prix de la saisie** : chaque saisie enregistre le prix du catalogue à ce moment. Un
   nouveau prix ne touche pas une ligne déjà enregistrée, tant que la famille ne la modifie
   pas.
5. **Enregistrement immédiat, avec retour en arrière.** Une case n'envoie qu'une requête à la
   fois ; la dernière valeur saisie part ensuite. Si le serveur refuse, la case reprend la
   dernière valeur enregistrée et un message explique pourquoi. « Même quantité chaque
   semaine » envoie toutes les cases en une seule requête. Un indicateur « Enregistrement… » /
   « Modifications enregistrées » dit quand on peut quitter l'écran.
6. **Pas de revalidatePath à chaque saisie** : les pages de commande sont dynamiques et se
   relisent à chaque visite ; l'écran calcule lui-même ses totaux.
7. **La correction par un référent ou un admin** viendra avec le bon de commande (E1) ; elle
   sera journalisée. D3 ne permet que la saisie par la famille, pour son propre foyer.

## Pourquoi

- Un choix explicite distingue « pas encore regardé » de « rien voulu » : c'est ce que montre
  « N producteurs sur M traités ».
- Sans statut « validée », impossible d'oublier de revalider après une modification : à la
  clôture, ce qui est saisi est commandé.
- Next.js envoie les actions serveur l'une après l'autre : une requête par case, multipliée
  par les semaines, laissait des enregistrements en attente si la famille quittait l'écran
  trop vite (vu en test). D'où l'envoi groupé et l'indicateur.

## Conséquences

- **Isolation** : la Row Level Security isole toujours les commandes par AMAP seulement. Une
  famille ne lit et n'écrit que la commande de SON foyer, mais par le code serveur
  (`myHousehold`). Des politiques par foyer (famille, référent de ses producteurs, admin)
  restent à poser ; elles devront laisser passer la tâche horaire de clôture, qui agit sans
  compte connecté.
- Les avoirs disponibles (F2) ne sont pas encore déduits du récapitulatif : les montants sont
  annoncés comme provisoires.
- L'accueil famille (D6) mènera à la commande ; en attendant, l'adresse est
  `/<amap>/famille/commande`.

## Complément : accueil de la famille (story D6, 2026-11-18)

- L'accueil met en avant une seule période (`homePeriod`) : celle qui est ouverte ; sinon la
  dernière clôturée dont le mois n'est pas fini (chèques à signer, distribution où les
  remettre) ; sinon la prochaine prévue (date d'ouverture).
- « Liste des chèques » : pendant les commandes, le récapitulatif (montants provisoires) ;
  après la clôture, `/<amap>/famille/cheques`, qui lit les chèques calculés à la clôture, avoirs
  déduits. Leur impression viendra avec E2.
- « Signaler un problème » mène à une page d'attente jusqu'à F5.
- L'accueil demande une connexion : il sort des pages publiques testées sans compte et des
  captures de référence.
