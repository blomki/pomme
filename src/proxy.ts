import { NextResponse, type NextRequest } from "next/server";

import { DEVICE_COOKIE, isDeviceId } from "./domain/devices";

import { sentryDsn, sentryOrigin } from "./monitoring/sentry";
import { storageOrigin, storageSettings } from "./server/files/settings";
import { contentSecurityPolicy, createNonce } from "./server/security-headers";

/** Serveur de Sentry à autoriser dans la CSP (null tant que Sentry est éteint). */
const ERROR_REPORT_ORIGIN = sentryOrigin(sentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN));

/** Stockage des images déposées (fiche S11), à autoriser dans img-src (null sans stockage). */
const IMAGE_ORIGIN = storageOrigin(storageSettings());

/**
 * Proxy Next.js : s'exécute avant chaque page. Il tire un nonce et pose la Content-Security-Policy
 * (voir server/security-headers.ts).
 *
 * Next.js lit la CSP dans les en-têtes de la requête et ajoute lui-même le nonce à ses scripts.
 * Cela n'est possible que si la page est construite à la demande, d'où le headers() du gabarit
 * racine (src/app/layout.tsx), qui rend toutes les pages dynamiques.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = contentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    errorReportOrigin: ERROR_REPORT_ORIGIN,
    imageOrigin: IMAGE_ORIGIN,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Cookie de l'appareil (S10, ADR 0041) : tiré au hasard à la première visite, et passé tout
  // de suite à la page, pour qu'une première connexion depuis ce navigateur soit reconnue.
  const known = request.cookies.get(DEVICE_COOKIE)?.value;
  const device = isDeviceId(known) ? null : newDeviceId();
  if (device) {
    const cookie = request.headers.get("cookie");
    requestHeaders.set("cookie", `${cookie ? `${cookie}; ` : ""}${DEVICE_COOKIE}=${device}`);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (device) {
    response.cookies.set(DEVICE_COOKIE, device, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 400 * 24 * 60 * 60, // durée maximale admise par les navigateurs
    });
  }
  return response;
}

/** Identifiant d'appareil : 24 octets tirés au hasard, en base64url (32 caractères). */
function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const config = {
  matcher: [
    {
      // Pas de CSP pour les fichiers statiques, les images et l'API : ce ne sont pas des pages.
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      // Ni pour le préchargement des liens (la vraie visite aura sa propre CSP).
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
