/**
 * Réglages communs de Sentry, le service qui recueille les erreurs de l'application (fiche S7,
 * ADR 0014). Utilisés côté serveur (src/instrumentation.ts) et côté navigateur
 * (src/instrumentation-client.ts).
 *
 * Deux exigences du cahier technique :
 * - **région UE** : seule une adresse Sentry hébergée en Allemagne (« .de.sentry.io ») est
 *   acceptée ; une autre adresse laisse Sentry éteint ;
 * - **aucune donnée personnelle** : rien sur la personne connectée, ni cookies, ni en-têtes, ni
 *   paramètres d'adresse (un lien de connexion contient un jeton), ni fil d'événements
 *   (« breadcrumbs », qui peut contenir des saisies) ; les adresses email restantes dans les
 *   messages d'erreur sont masquées.
 *
 * Sans clé (variable NEXT_PUBLIC_SENTRY_DSN vide), Sentry reste éteint : rien n'est envoyé.
 * La clé n'est pas un secret : elle permet seulement d'envoyer des erreurs, et le navigateur
 * doit la connaître pour signaler les siennes.
 */

/** Hôte des serveurs Sentry de la région UE (Francfort). */
const EU_INGEST_HOST = /^o\d+\.ingest\.de\.sentry\.io$/;

/**
 * Clé Sentry (DSN) utilisable, ou null : vide, mal formée ou hors de la région UE.
 *
 * @example sentryDsn("https://abc@o123.ingest.de.sentry.io/456") // la même adresse
 * @example sentryDsn("https://abc@o123.ingest.us.sentry.io/456") // null (hors UE)
 */
export function sentryDsn(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username && EU_INGEST_HOST.test(url.hostname)
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Origine à autoriser dans la CSP (connect-src) pour que le navigateur joigne Sentry. */
export function sentryOrigin(dsn: string | null): string | null {
  return dsn ? new URL(dsn).origin : null;
}

const EMAIL = /[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+/g;

/** Masque les adresses email d'un texte. */
export function maskEmails(text: string): string {
  return text.replace(EMAIL, "[email]");
}

/** Adresse sans paramètres ni ancre : « /verify?token=… » → « /verify ». */
export function stripQuery(url: string): string {
  return url.replace(/[?#].*$/, "");
}

/** Forme minimale d'un événement Sentry, limitée aux champs que l'on nettoie. */
type ScrubbableEvent = {
  user?: unknown;
  breadcrumbs?: unknown;
  extra?: unknown;
  message?: string;
  request?: {
    url?: string;
    cookies?: unknown;
    headers?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  exception?: { values?: Array<{ value?: string }> };
};

/**
 * Retire d'un événement Sentry tout ce qui pourrait désigner une personne, avant l'envoi
 * (option beforeSend). L'erreur, sa pile d'appels et la page (sans paramètres) restent : c'est
 * ce qui sert à corriger.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  if (event.message) event.message = maskEmails(event.message);
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = maskEmails(exception.value);
  }
  return event;
}

/** Options de Sentry.init, ou null si Sentry doit rester éteint. */
export function sentryOptions(env: {
  NEXT_PUBLIC_SENTRY_DSN?: string;
  NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string;
}) {
  const dsn = sentryDsn(env.NEXT_PUBLIC_SENTRY_DSN);
  if (!dsn) return null;
  return {
    dsn,
    // « preprod » ou « production » : pour savoir d'où vient une erreur.
    environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
    // Ni adresse IP, ni cookies, ni personne connectée.
    sendDefaultPii: false,
    // Pas de fil d'événements : il peut contenir des saisies ou des adresses.
    maxBreadcrumbs: 0,
    // Erreurs seulement, pas de mesure des performances : l'offre gratuite suffit.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
