import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { NewAmapForm } from "@/ui/platform/NewAmapForm";

// /plateforme/amaps/nouvelle : création d'une AMAP (story J1). La mise en page vérifie déjà le
// compte gestionnaire et la deuxième vérification ; l'action les vérifie de nouveau.
export default async function NewAmapPage() {
  const t = await getTranslations("Platform");
  // Adresse affichée sous le champ « Adresse » : domaine de la plateforme, sans « https:// ».
  const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").host;
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("createTitle")}
      </Typography>
      <Typography sx={{ mb: 3, maxWidth: 820 }}>{t("createIntro")}</Typography>
      <NewAmapForm baseUrl={base} />
    </>
  );
}
