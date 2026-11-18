import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

/** Commande impossible : pas de foyer dans cette AMAP, ou période pas ouverte. */
export async function OrderState({ state }: { state: "no_household" | "not_open" }) {
  const t = await getTranslations("Family.order");
  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        {t("titleNoMonth")}
      </Typography>
      <Typography>{state === "no_household" ? t("noHousehold") : t("notOpen")}</Typography>
    </>
  );
}
