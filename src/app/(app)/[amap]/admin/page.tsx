import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../../_components/PlaceholderPage";

// Administration d'une AMAP (ordinateur) : [domaine]/<amap>/admin.
export default function AdminHomePage() {
  const t = useTranslations("Admin");
  return <PlaceholderPage title={t("title")} />;
}
