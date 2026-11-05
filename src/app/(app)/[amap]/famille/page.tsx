import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../../_components/PlaceholderPage";

// Espace famille d'une AMAP (mobile) : [domaine]/<amap>/famille.
export default function FamilyHomePage() {
  const t = useTranslations("Family");
  return <PlaceholderPage title={t("title")} />;
}
