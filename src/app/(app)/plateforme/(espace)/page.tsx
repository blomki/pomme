import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../../_components/PlaceholderPage";

// Espace du gestionnaire de la plateforme (création d'AMAP, story J1), réservé aux comptes is_platform_admin.
export default function PlatformHomePage() {
  const t = useTranslations("Platform");
  return <PlaceholderPage title={t("title")} />;
}
