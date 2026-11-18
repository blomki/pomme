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
  // Chez Clever Cloud (CC_DEPLOYMENT_ID, posé par Clever Cloud à chaque déploiement), le build
  // ne revérifie pas les types : sur leur machine de build, cette étape restait bloquée jusqu'à
  // l'abandon du déploiement (30 minutes, vu deux fois le 2026-11-18). Aucune protection en
  // moins : la CI vérifie les types (pnpm typecheck) avant tout déploiement en pré-production,
  // et la production ne reçoit qu'un commit déjà passé par la pré-production. En local et dans
  // la CI, le build continue de vérifier les types.
  typescript: { ignoreBuildErrors: Boolean(process.env.CC_DEPLOYMENT_ID) },
};

export default withNextIntl(nextConfig);
