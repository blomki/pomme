import { useTranslations } from "next-intl";

// Espace référent d'une AMAP (ordinateur) : [domaine]/<amap>/referent.
export default function ReferentHomePage() {
  const t = useTranslations("Referent");
  const common = useTranslations("Common");
  return (
    <>
      <h1>{t("title")}</h1>
      <p>{common("underConstruction")}</p>
    </>
  );
}
