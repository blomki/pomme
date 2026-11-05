import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Le plugin next-intl indique à Next.js où trouver la configuration des textes
// (langue, fuseau horaire, fichiers de messages) : voir src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // N'affiche pas « X-Powered-By: Next.js » : inutile de renseigner un attaquant.
  poweredByHeader: false,
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
