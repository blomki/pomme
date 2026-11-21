# 0032. Réglages de l'AMAP

- Statut : accepté
- Date : 2026-11-21

## Contexte

Les administrateurs d'une AMAP doivent pouvoir changer ce que voient les familles, les
producteurs et les visiteurs : nom affiché, logo, couleurs, police des titres, contact, et
quelques paramètres (story A4). La création (J1, ADR 0031) a déjà posé le thème et les réglages
par défaut ; le jour, les horaires et le lieu de distribution se règlent déjà depuis le planning
(D1).

## Décision

1. **Écran `/<amap>/admin/reglages`**, entrée « Réglages » du menu de l'administration,
   réservé aux admins (requireRole ; la Row Level Security ne laisse modifier que l'AMAP
   courante).
2. **Champs** : nom affiché, couleurs clés et police des titres (même aperçu clair et sombre
   que la création, contraste vérifié), email de contact, et trois paramètres bornés :
   bénévoles par distribution (1 à 20, 3 par défaut), seuil « expérimenté » (1 à 50
   permanences, 6 par défaut), alerte de fin d'adhésion (1 à 180 jours, 30 par défaut).
3. **L'adresse (slug) est affichée en lecture seule** : la changer casserait les liens déjà
   envoyés ; seul le gestionnaire de la plateforme pourra le faire.
4. **Distribution** : rappelée pour mémoire, avec un lien vers le planning, où elle se modifie
   déjà ; pas de second endroit pour la même chose.
5. **Logo** : même chemin que la photo du producteur (S11, ADR 0022) : type et taille contrôlés,
   image ré-encodée en WebP (512 points au plus), rangée dans le stockage hors du serveur web,
   l'ancienne supprimée après la transaction. Son texte alternatif est le nom de l'AMAP : pas de
   champ à remplir.
6. **Journal** : chaque enregistrement (réglages, logo envoyé ou retiré) écrit une ligne avec
   l'avant et l'après.

## Pourquoi

- Des bornes sur les paramètres évitent qu'une faute de frappe (« 300 bénévoles ») ne fausse
  le planning ou les alertes.
- Un champ en lecture seule plutôt que désactivé : le texte reste lisible (contraste suffisant)
  et l'explication est annoncée par les lecteurs d'écran.

## Conséquences

- Le nouveau thème s'applique aussitôt à toute l'AMAP (pages relues après l'enregistrement).
- Le seuil « expérimenté » et le nombre de bénévoles serviront au planning des permanences
  (G1, G2) ; ils sont déjà enregistrés.
