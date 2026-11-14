import { NextResponse, type NextRequest } from "next/server";

import { contentSecurityPolicy, createNonce } from "./server/security-headers";

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
  const csp = contentSecurityPolicy({ nonce, isDev: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
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
