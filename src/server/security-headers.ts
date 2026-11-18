/**
 * En-têtes de sécurité HTTP (cahier technique, section 5 ; ADR 0008).
 *
 * Deux familles :
 * - des en-têtes fixes, les mêmes pour toutes les réponses (next.config.ts) ;
 * - la Content-Security-Policy (CSP), qui contient un « nonce » : un nombre aléatoire tiré à
 *   chaque page (src/proxy.ts). Seuls les scripts qui portent ce nonce s'exécutent ; un script
 *   injecté par un attaquant (faille XSS) ne le connaît pas et il est bloqué par le navigateur.
 */

/** Adresses des serveurs de Friendly Captcha : son widget s'affiche dans des iframes (ADR 0007). */
const CAPTCHA_ORIGINS = "https://*.frcapi.com";

/**
 * Construit la CSP d'une page.
 *
 * - script-src : 'strict-dynamic' laisse aussi passer les scripts chargés par un script de
 *   confiance (découpage du code par Next.js, kit Friendly Captcha). En développement, React a
 *   besoin d'eval pour afficher les erreurs : jamais en production.
 * - style-src 'unsafe-inline' : MUI écrit des styles directement sur certains éléments
 *   (attribut style), qu'un nonce ne couvre pas. Un style injecté ne peut pas exécuter de code ;
 *   le risque est faible et Mozilla Observatory ne le pénalise pas. Pas de nonce ici : sa
 *   présence ferait ignorer 'unsafe-inline' par le navigateur.
 * - connect-src : le serveur de Sentry (région UE) quand il est configuré, pour que le navigateur
 *   puisse signaler ses erreurs (ADR 0014).
 * - frame-ancestors 'none' : aucun site ne peut afficher Pomme dans un cadre (« clickjacking »).
 */
export function contentSecurityPolicy({
  nonce,
  isDev,
  errorReportOrigin = null,
}: {
  nonce: string;
  isDev: boolean;
  /** Origine du service d'erreurs (Sentry), ou null s'il est éteint. */
  errorReportOrigin?: string | null;
}) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${CAPTCHA_ORIGINS}${errorReportOrigin ? ` ${errorReportOrigin}` : ""}`,
    `frame-src ${CAPTCHA_ORIGINS}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

/** Nonce aléatoire (128 bits), différent à chaque page. */
export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}

/** En-têtes fixes, ajoutés à toutes les réponses. */
export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // HTTPS obligatoire pendant deux ans, sous-domaines compris. Ignoré en HTTP (développement).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Le navigateur ne devine pas le type d'un fichier (un faux « .png » ne devient pas un script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // L'adresse complète d'une page (qui peut contenir un jeton) ne part pas vers un autre site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Ancienne forme de frame-ancestors 'none', pour les navigateurs qui ignorent la CSP.
  { key: "X-Frame-Options", value: "DENY" },
  // Une fenêtre ouverte par un autre site ne peut pas piloter Pomme.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Fonctions de l'appareil inutiles à Pomme : refusées à toutes les pages.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];
