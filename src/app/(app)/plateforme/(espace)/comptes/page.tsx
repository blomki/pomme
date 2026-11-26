import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { AccountLookup } from "@/ui/platform/AccountLookup";

// /plateforme/comptes : retrouver un compte et réinitialiser sa deuxième vérification (story
// S10b, ADR 0047). La mise en page vérifie déjà le compte gestionnaire et la deuxième
// vérification ; les actions les vérifient de nouveau.
export default async function PlatformAccountsPage() {
  const t = await getTranslations("Platform.accounts");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 3, maxWidth: 820 }}>{t("intro")}</Typography>
      <AccountLookup />
    </>
  );
}
