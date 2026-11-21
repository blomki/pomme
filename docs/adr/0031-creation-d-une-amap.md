# 0031. Création d'une AMAP par le gestionnaire de la plateforme

- Statut : accepté
- Date : 2026-11-20

## Contexte

Le gestionnaire de la plateforme crée une AMAP et invite son premier administrateur (story J1).
La Row Level Security (ADR 0003) interdit au rôle de l'application de créer une AMAP (aucune
politique INSERT sur `amap`) et de donner un rôle hors de l'AMAP courante. Il faut pourtant,
en une seule fois : l'AMAP, le compte de l'administrateur s'il n'existe pas, son rôle et la ligne
du journal.

## Décision

1. **Une fonction de base dédiée, `create_amap`** (migration écrite à la main, ADR 0009),
   `SECURITY DEFINER`, appelable par le seul rôle de l'application. Elle vérifie elle-même que
   la personne connectée (`app.user_id`) est gestionnaire (`is_platform_admin`), puis écrit
   l'AMAP, le compte (adresse en minuscules), le rôle admin et le journal, dans la transaction de
   l'appel. Aucun contournement général de la RLS.
2. **Contrôles avant l'appel** (`domain/amap-creation.ts`) : nom, adresse (règles et mots
   réservés de `amap-slug.ts`), couleurs « #rrggbb », lieu, jour, horaires, fuseau (France
   métropolitaine et outre-mer). L'adresse déjà prise est refusée par l'index unique et
   affichée comme telle.
3. **Deuxième vérification obligatoire** : la mise en page de `/plateforme` l'exige, l'action
   et `createAmap` la vérifient de nouveau.
4. **Invitation après la création**, une fois la transaction validée : un email aux couleurs de
   l'AMAP, sans lien de connexion (comme les autres invitations), tracé dans le journal des
   emails de la nouvelle AMAP. S'il ne part pas, l'AMAP reste créée et l'écran le dit.
5. **Réglages par défaut** : 3 bénévoles par distribution, expérimenté à partir de
   6 permanences, alerte d'adhésion 30 jours avant la fin ; jour et horaires de distribution
   saisis.
6. **Aperçu du thème** en clair et en sombre, recalculé à chaque couleur, avec la vérification
   du contraste (`findContrastFailures`). Les tons de Material 3 garantissent en pratique un
   contraste suffisant quelle que soit la couleur clé (aucun échec sur 4 096 couleurs essayées) :
   la vérification reste un filet de sécurité, avec une alerte si une combinaison ne passe pas.

## Pourquoi

- Une fonction étroite, qui contrôle elle-même le droit, est plus sûre qu'un accès de
  confiance général : même une faille dans l'application ne permettrait pas à un admin
  d'AMAP de créer une AMAP.
- Envoyer l'email hors de la transaction évite d'inviter quelqu'un à une AMAP dont la création
  aurait finalement échoué.

## Conséquences

- **Logo** : reporté aux réglages de l'AMAP (A4) ; il faut l'identifiant de l'AMAP pour ranger
  l'image (S11).
- **Pages obligatoires** (accueil, mentions légales) : créées avec le site public (H2), qui
  ajoute la table des pages ; `create_amap` sera alors complétée.
- Changer l'adresse d'une AMAP restera réservé au gestionnaire (A4 ne la modifie pas).
