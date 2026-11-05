import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { MobileShell } from "@/ui/layout/MobileShell";
import { AppThemeProvider } from "@/ui/theme/AppThemeProvider";
import { PLATFORM_THEME } from "@/ui/theme/key-colors";

// Pages publiques de la plateforme (accueil) : thème Pomme.
export default async function PlatformPublicLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Home");
  return (
    <AppThemeProvider config={PLATFORM_THEME}>
      <MobileShell title={t("title")}>{children}</MobileShell>
    </AppThemeProvider>
  );
}
