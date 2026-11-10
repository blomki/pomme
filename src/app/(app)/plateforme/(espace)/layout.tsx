import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { requirePlatformAdminPage } from "@/server/auth/guards";
import { DesktopShell } from "@/ui/layout/DesktopShell";
import { AppThemeProvider } from "@/ui/theme/AppThemeProvider";
import { PLATFORM_THEME } from "@/ui/theme/key-colors";

// Gestion de la plateforme : thème Pomme, gabarit ordinateur. Réservée aux gestionnaires,
// après la deuxième vérification (story A1).
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdminPage();
  const t = await getTranslations("Platform");
  return (
    <AppThemeProvider config={PLATFORM_THEME}>
      <DesktopShell title={t("shortTitle")} area="platform">
        {children}
      </DesktopShell>
    </AppThemeProvider>
  );
}
