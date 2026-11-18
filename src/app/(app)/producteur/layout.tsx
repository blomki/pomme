import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { requireProducerPage } from "@/server/auth/guards";
import { MobileShell } from "@/ui/layout/MobileShell";
import { ProducerBottomNavigation } from "@/ui/layout/ProducerBottomNavigation";
import { AppThemeProvider } from "@/ui/theme/AppThemeProvider";
import { resolveThemeConfig } from "@/ui/theme/key-colors";

// Espace producteur : gabarit mobile avec barre du bas, aux couleurs et à la police des titres
// de l'AMAP courante (story C4). Connexion obligatoire, compte lié à un producteur.
export default async function ProducerLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Producer");
  const { amap } = await requireProducerPage();
  return (
    <AppThemeProvider config={resolveThemeConfig(amap.theme)}>
      <MobileShell title={t("title")} bottomNavigation={<ProducerBottomNavigation />}>
        {children}
      </MobileShell>
    </AppThemeProvider>
  );
}
