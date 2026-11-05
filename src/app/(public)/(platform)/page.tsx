import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

// Accueil de la plateforme ([domaine]/). Les AMAP ont leur propre page : [domaine]/<adresse-de-l-amap>.
export default function HomePage() {
  const t = useTranslations("Home");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography>{t("intro")}</Typography>
    </>
  );
}
