import { useTranslations } from "next-intl";

// Espace du gestionnaire de la plateforme (création d'AMAP, story J1), réservé aux comptes is_platform_admin.
export default function PlatformHomePage() {
  const t = useTranslations("Platform");
  const common = useTranslations("Common");
  return (
    <>
      <h1>{t("title")}</h1>
      <p>{common("underConstruction")}</p>
    </>
  );
}
