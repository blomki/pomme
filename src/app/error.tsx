"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { useTranslations } from "next-intl";

import { MobileShell } from "@/ui/layout/MobileShell";
import { LinkButton } from "@/ui/navigation/LinkButton";
import { AppThemeProvider } from "@/ui/theme/AppThemeProvider";
import { PLATFORM_THEME } from "@/ui/theme/key-colors";

// Erreur pendant l'affichage d'une page (fiche #124) : remplace la page anglaise de Next.js
// (« This page couldn't load ») par une page en français, avec un lien de retour.
// Next.js impose un composant client ici : il peut ainsi proposer « Réessayer » (reset).
// Le détail de l'erreur n'est jamais affiché (il peut contenir des données internes) ; seul
// son identifiant (digest), qui figure aussi dans les journaux du serveur, aide le support.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPage");
  const home = useTranslations("Home");
  return (
    <AppThemeProvider config={PLATFORM_THEME}>
      <MobileShell title={home("title")}>
        <Typography variant="h1" gutterBottom>
          {t("title")}
        </Typography>
        <Typography gutterBottom>{t("text")}</Typography>
        {error.digest && (
          <Typography variant="bodySmall" color="text.secondary" gutterBottom>
            {t("reference", { digest: error.digest })}
          </Typography>
        )}
        <Stack direction="row" spacing={2} sx={{ mt: 3, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={reset}>
            {t("retry")}
          </Button>
          <LinkButton href="/connexion/suite" variant="outlined">
            {t("back")}
          </LinkButton>
        </Stack>
      </MobileShell>
    </AppThemeProvider>
  );
}
