# Données personnelles (RGPD) : qui fait quoi

Ce dossier rassemble les **premiers projets** des documents demandés par la recette (fiche S9) :

- [Registre des traitements](registre-des-traitements.md) : à tenir par chaque AMAP ;
- [Politique de confidentialité](politique-de-confidentialite.md) : à publier sur le site de
  chaque AMAP ;
- [Mentions légales](mentions-legales.md) : à publier sur le site de chaque AMAP (page
  « Mentions légales », créée en brouillon avec chaque AMAP).

Ce sont des modèles. Les passages entre crochets sont à remplir : `[à compléter]` pour une
information que seule l'AMAP connaît, `[à décider]` pour un choix encore ouvert. Ils doivent
être relus par le bureau de l'AMAP avant publication.

## Les rôles

- **Chaque AMAP est responsable de traitement.** C'est elle qui décide pourquoi elle collecte
  les données de ses adhérents (gérer les foyers, les commandes, les chèques, les
  permanences). Elle tient son registre et répond aux demandes des personnes.
- **Le gestionnaire de la plateforme Pomme est sous-traitant** de chaque AMAP : il héberge les
  données et fait fonctionner l'application pour elle, sans les utiliser pour autre chose. Un
  contrat de sous-traitance (article 28 du RGPD) entre l'AMAP et le gestionnaire est à
  signer : `[à compléter : modèle de contrat]`.
- **Les prestataires techniques** (hébergement, emails, sauvegardes…) sont des
  sous-traitants ultérieurs. Tous sont établis dans l'Union européenne et y traitent les
  données. Leur liste est dans la politique de confidentialité.

## Ce que Pomme fait déjà

- Données hébergées en France (Clever Cloud) ; copie de sauvegarde chiffrée en France
  (Scaleway, Paris).
- Pas de coordonnées bancaires : seuls le numéro, le montant et l'état des chèques sont notés.
- Pas de mot de passe ; deuxième vérification pour les admins et les référents.
- Isolation des AMAP dans la base : une AMAP ne voit jamais les données d'une autre.
- Export des données d'un foyer et anonymisation sur demande (ADR 0010).
- Aucune donnée personnelle envoyée à Sentry (supervision des erreurs, ADR 0014).
- Aucun cookie de mesure d'audience ni de publicité.

## Points à trancher avant la mise en production

- Durée de conservation des demandes d'adhésion refusées (ADR 0034 : « par exemple un an »).
- Durée de conservation des foyers archivés et du journal des actions.
- Confirmation écrite de Friendly Captcha : aucune donnée utilisée pour entraîner une IA
  (fiche #7).
- Contrat de sous-traitance entre chaque AMAP et le gestionnaire de la plateforme.
