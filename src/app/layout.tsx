import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("title"), description: t("description") };
}

// Gabarit racine, commun à toutes les pages. Le thème Material Design 3 (MUI)
// et les polices seront ajoutés par la fiche S4.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("Common");
  return (
    <html lang={locale}>
      <body>
        {/* Premier élément focalisable : permet aux utilisateurs du clavier de sauter la navigation (RGAA 12.7). */}
        <a href="#contenu">{t("skipToContent")}</a>
        <NextIntlClientProvider>
          <main id="contenu">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
