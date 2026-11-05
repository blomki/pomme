import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { MobileShell } from "@/ui/layout/MobileShell";
import { ProducerBottomNavigation } from "@/ui/layout/ProducerBottomNavigation";
import { AppThemeProvider } from "@/ui/theme/AppThemeProvider";
import { PLATFORM_THEME } from "@/ui/theme/key-colors";

// Espace producteur : gabarit mobile avec barre du bas. Thème de la plateforme en attendant
// le choix de l'AMAP courante (story C4), qui appliquera le thème de cette AMAP.
export default async function ProducerLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Producer");
  return (
    <AppThemeProvider config={PLATFORM_THEME}>
      <MobileShell title={t("title")} bottomNavigation={<ProducerBottomNavigation />}>
        {children}
      </MobileShell>
    </AppThemeProvider>
  );
}
