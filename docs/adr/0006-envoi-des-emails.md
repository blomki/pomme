# 0006. Envoi des emails : relais SMTP de Brevo et journal des envois

- Statut : accepté
- Date : 2026-11-10

## Contexte

Pomme envoie des emails : liens de connexion aujourd'hui ; demain relances avant la clôture,
rappels, planning des permanences, emails groupés. Le cahier technique retient Brevo
(entreprise française, offre gratuite de 300 emails par jour, suffisante pour 40 foyers) et
demande de tracer chaque envoi dans `notification_log`, pour ne jamais relancer deux fois.

## Décision

1. **Brevo par son relais SMTP**, avec Nodemailer : en local, Mailpit reçoit les mêmes
   emails par SMTP. Seule la variable `SMTP_URL` change d'un environnement à l'autre.
2. **Un gabarit commun** (`src/server/email/layout.ts`) : version texte complète et version
   HTML en tableaux avec styles en ligne, sans aucune image, aux couleurs Material Design 3 de
   l'AMAP (Pomme pour les emails de la plateforme).
3. **Chaque envoi passe par `sendNotification`** (`src/server/email/notify.ts`) :
   limitation de débit, puis réservation d'une ligne `pending` dans `notification_log`, envoi,
   et statut final (`sent` avec l'identifiant du message, ou `failed` avec l'erreur).
4. **Dédoublonnage par la base** : une relance porte une clé (`dedupeKey(modèle, personne,
occasion)`). Un index unique partiel sur `(amap_id, dedupe_key)`, limité aux statuts
   `pending` et `sent`, refuse une deuxième réservation : même deux tâches simultanées
   n'envoient qu'un email. Après un échec, un nouvel essai reste possible.
5. **Limitation de débit** (en mémoire) : 20 emails par heure et par adresse, 100 par minute
   pour toute la plateforme. Au-delà, l'email ne part pas et la ligne est `rate_limited`.
6. **Isolation** : les emails d'une AMAP sont écrits par l'application dans le contexte de
   l'AMAP (RLS) ; les emails de la plateforme (`amap_id` vide, lien de connexion), par le rôle
   `pomme_auth` seulement.

## Pourquoi

- SMTP plutôt que l'API HTTP de Brevo : aucune bibliothèque de plus, le même chemin en local et
  en production, et l'on peut changer de fournisseur sans toucher au code.
- La réservation avant l'envoi, garantie par un index unique, est la seule façon sûre d'éviter
  un double envoi quand une tâche planifiée est relancée ou tourne deux fois. Un simple « déjà
  envoyé ? » avant l'envoi laisserait passer deux tâches simultanées.
- Le contenu des emails n'est pas conservé : il peut contenir un lien de connexion, et le
  journal n'a besoin que de savoir quoi, à qui et quand.
- Pas d'images : beaucoup de messageries les bloquent, et l'email doit rester complet.

## Conséquences

- **Avant la production** (le nom de domaine n'est pas encore choisi, issue #49) :
  1. créer le compte Brevo, et y ajouter le domaine d'envoi `[domaine]` (Brevo › Expéditeurs,
     domaines et IP dédiées › Domaines) ;
  2. ajouter dans la zone DNS les enregistrements donnés par Brevo : code de vérification,
     **DKIM** (clé de signature), **SPF** (`v=spf1 include:spf.brevo.com ~all`, à fusionner
     avec un SPF existant), et **DMARC** (`_dmarc` : commencer par
     `v=DMARC1; p=none; rua=mailto:dmarc@[domaine]`, puis passer à `quarantine` après
     quelques semaines de rapports sans erreur) ;
  3. vérifier le domaine dans Brevo, puis régler chez l'hébergeur `SMTP_URL` (identifiant et
     clé SMTP Brevo) et `EMAIL_FROM` (`Pomme <ne-pas-repondre@[domaine]>`) ;
  4. envoyer un lien de connexion de test et contrôler les en-têtes (`spf=pass`,
     `dkim=pass`, `dmarc=pass`), par exemple avec mail-tester.com.
- La limitation en mémoire, comme celle de la connexion, devra passer en base si Pomme tourne
  sur plusieurs instances.
- Les emails des AMAP (relances, rappels) s'enverront dans une transaction à part, après
  l'action qui les déclenche, pour que la trace ne soit pas annulée avec elle.
- `RATE_LIMIT_FACTOR` (anciennement `AUTH_RATE_LIMIT_FACTOR`) assouplit toutes les limites en
  développement et en CI.
