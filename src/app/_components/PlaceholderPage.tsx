import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

/** Page provisoire d'un écran pas encore développé : son titre et « Écran en construction ». */
export function PlaceholderPage({ title }: { title: string }) {
  const t = useTranslations("Common");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {title}
      </Typography>
      <Typography>{t("underConstruction")}</Typography>
    </>
  );
}
