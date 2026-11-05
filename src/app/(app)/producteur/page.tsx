import { useTranslations } from "next-intl";

// Espace producteur (mobile), commun à toutes ses AMAP : l'AMAP courante se choisit à l'écran.
export default function ProducerHomePage() {
  const t = useTranslations("Producer");
  const common = useTranslations("Common");
  return (
    <>
      <h1>{t("title")}</h1>
      <p>{common("underConstruction")}</p>
    </>
  );
}
