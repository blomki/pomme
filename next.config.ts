import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { SECURITY_HEADERS } from "./src/server/security-headers";

// Le plugin next-intl indique à Next.js où trouver la configuration des textes
// (langue, fuseau horaire, fichiers de messages) : voir src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // N'affiche pas « X-Powered-By: Next.js » : inutile de renseigner un attaquant.
  poweredByHeader: false,
  reactStrictMode: true,
  // En-têtes de sécurité fixes, sur toutes les réponses. La CSP, elle, change à chaque page :
  // elle est posée par src/proxy.ts.
  headers: async () => [{ source: "/:path*", headers: [...SECURITY_HEADERS] }],
};

export default withNextIntl(nextConfig);
