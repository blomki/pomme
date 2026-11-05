import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { COLOR_SCHEME_ATTRIBUTE } from "@/ui/theme/color-scheme";
import { fontVariables } from "@/ui/theme/fonts";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("title"), description: t("description") };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Couleur de la barre du navigateur mobile, selon le mode de l'appareil.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

/**
 * Gabarit racine, commun à toutes les pages : langue, polices, styles MUI, textes.
 * Chaque espace (page publique, famille, référent…) ajoute ensuite son thème et sa mise en page.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("Common");
  return (
    // suppressHydrationWarning : le script de mode d'affichage modifie <html> avant React.
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <body>
        {/* Applique le mode clair ou sombre avant l'affichage : pas de flash blanc en sombre. */}
        <InitColorSchemeScript attribute={COLOR_SCHEME_ATTRIBUTE} defaultMode="system" />
        {/* Premier élément focalisable : permet de sauter la navigation au clavier (RGAA 12.7). */}
        <a className="skip-link" href="#contenu">
          {t("skipToContent")}
        </a>
        <AppRouterCacheProvider>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
