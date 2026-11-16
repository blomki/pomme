import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./monitoring/sentry";

// Lu par Next.js dans le navigateur, avant l'affichage : allume Sentry pour les erreurs côté
// navigateur, avec les mêmes réglages que le serveur (monitoring/sentry.ts). Les variables sont
// citées une à une : Next.js les remplace par leur valeur au moment du build.
const options = sentryOptions({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
});
if (options) Sentry.init(options);
