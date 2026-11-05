import { useTranslations } from "next-intl";

// Espace famille d'une AMAP (mobile) : [domaine]/<amap>/famille.
export default function FamilyHomePage() {
  const t = useTranslations("Family");
  const common = useTranslations("Common");
  return (
    <>
      <h1>{t("title")}</h1>
      <p>{common("underConstruction")}</p>
    </>
  );
}
