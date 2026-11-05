import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../../_components/PlaceholderPage";

// Espace référent d'une AMAP (ordinateur) : [domaine]/<amap>/referent.
export default function ReferentHomePage() {
  const t = useTranslations("Referent");
  return <PlaceholderPage title={t("title")} />;
}
