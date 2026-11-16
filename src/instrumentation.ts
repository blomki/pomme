import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./monitoring/sentry";

/**
 * Lu par Next.js au démarrage du serveur : allume Sentry (voir monitoring/sentry.ts) si une clé
 * de la région UE est configurée. Les variables sont citées une à une : Next.js remplace
 * chaque process.env.NEXT_PUBLIC_… par sa valeur au moment du build.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const options = sentryOptions({
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  });
  if (options) Sentry.init(options);
}

/** Erreurs des pages, Server Actions et routes : transmises à Sentry (rien s'il est éteint). */
export const onRequestError = Sentry.captureRequestError;
