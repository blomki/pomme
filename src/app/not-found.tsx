import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import { MobileShell } from "@/ui/layout/MobileShell";
import { AppThemeProvider } from "@/ui/theme/AppThemeProvider";
import { PLATFORM_THEME } from "@/ui/theme/key-colors";

// Page 404 : adresse inconnue (y compris une AMAP qui n'existe pas).
export default function NotFound() {
  const t = useTranslations("NotFound");
  const home = useTranslations("Home");
  return (
    <AppThemeProvider config={PLATFORM_THEME}>
      <MobileShell title={home("title")}>
        <Typography variant="h1" gutterBottom>
          {t("title")}
        </Typography>
        <Typography>{t("text")}</Typography>
      </MobileShell>
    </AppThemeProvider>
  );
}
