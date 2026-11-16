# 0014. Surveillance : erreurs (Sentry) et disponibilité (sonde GitHub Actions)

- Statut : accepté
- Date : 2026-11-16

## Contexte

La fiche S7 demande de savoir quand Pomme casse, sans attendre qu'une famille le signale :

- les erreurs de l'application (serveur et navigateur) recueillies par Sentry, région UE, sans
  données personnelles ;
- une sonde de disponibilité toutes les 5 minutes, avec alerte par email ;
- des journaux conservés 30 jours.

Le budget d'hébergement est déjà atteint (environ 22 €/mois) : la surveillance doit être
gratuite.

## Décision

1. **Sentry**, offre gratuite, organisation créée dans la région UE (Francfort). Le SDK
   `@sentry/nextjs` est appelé directement (`src/instrumentation.ts` côté serveur,
   `src/instrumentation-client.ts` côté navigateur), avec les réglages de
   `src/monitoring/sentry.ts`. Il reste éteint tant que `NEXT_PUBLIC_SENTRY_DSN` ne contient pas
   une clé de la région UE.
2. **Sonde** : un workflow GitHub Actions planifié (`.github/workflows/uptime.yml`) interroge
   `/api/health` toutes les 5 minutes. En cas d'échec après trois essais, il ouvre une issue
   « Panne » (GitHub l'envoie par email), qu'il ferme quand l'adresse répond de nouveau.
3. **Journaux** : pas encore de conservation au-delà des 7 jours de Clever Cloud (voir
   Conséquences).

## Pourquoi

**Aucune donnée personnelle chez Sentry.** Sentry envoie par défaut beaucoup de contexte. On
retire avant l'envoi (`beforeSend`) : la personne connectée, les cookies, les en-têtes, le corps
des requêtes, les paramètres d'adresse (un lien de connexion contient un jeton) et tout le fil
d'événements (« breadcrumbs »), qui peut contenir des saisies. Les adresses email restées dans un
message d'erreur sont masquées. Ces règles sont des fonctions pures, testées
(`sentry.test.ts`).

**Région UE vérifiée par le code.** Une clé d'une autre région est ignorée : une erreur de
configuration ne peut pas envoyer de données hors de l'UE.

**Pas de `withSentryConfig`.** Ce module modifie le build (téléversement des « source maps »,
instrumentation automatique) et demande un jeton secret de plus. Sans lui, les erreurs du
navigateur arrivent avec un code compacté, plus difficile à lire ; celles du serveur restent
lisibles. On pourra l'ajouter si le besoin se fait sentir.

**Pas de mesure des performances** (`tracesSampleRate: 0`) : l'offre gratuite suffit pour les
erreurs, et rien ne sort au-delà.

**Sonde GitHub Actions plutôt qu'UptimeRobot ou un service payant** : gratuite, rien à créer,
l'alerte arrive par le canal déjà suivi (les issues du dépôt), et l'historique des contrôles est
public dans Actions. Limite acceptée : GitHub lance les tâches planifiées « au mieux » ; aux
heures chargées, l'écart réel entre deux contrôles peut dépasser 5 minutes. Le contrôle reste
« réussi » même en cas de panne, sinon GitHub enverrait aussi un email d'échec toutes les
5 minutes.

## Conséquences

- Pour allumer Sentry : créer le compte (région UE), puis définir `NEXT_PUBLIC_SENTRY_DSN` et
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT` chez Clever Cloud, et redéployer (la clé est lue au build).
  La CSP autorise alors le serveur de Sentry (`connect-src`).
- La clé Sentry est visible dans le code envoyé au navigateur : c'est prévu par Sentry, elle ne
  permet que d'envoyer des erreurs.
- La sonde surveille la variable de dépôt `UPTIME_URLS` (la pré-production par défaut) : ajouter
  `https://pomme.cloud` à la mise en production.
- GitHub suspend les tâches planifiées d'un dépôt public sans activité pendant 60 jours : un
  email prévient avant.
- Journaux sur 30 jours : il faut un « drain » Clever Cloud vers un service externe (Datadog,
  Elasticsearch, syslog…). Choix à faire, avec son coût et le lieu d'hébergement : les journaux
  peuvent contenir des adresses email.
