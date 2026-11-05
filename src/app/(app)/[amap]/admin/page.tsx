import { useTranslations } from "next-intl";

// Administration d'une AMAP (ordinateur) : [domaine]/<amap>/admin.
export default function AdminHomePage() {
  const t = useTranslations("Admin");
  const common = useTranslations("Common");
  return (
    <>
      <h1>{t("title")}</h1>
      <p>{common("underConstruction")}</p>
    </>
  );
}
