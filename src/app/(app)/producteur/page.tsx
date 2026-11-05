import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

// Espace producteur (mobile), commun à toutes ses AMAP : l'AMAP courante se choisira à l'écran (C4).
export default function ProducerHomePage() {
  const t = useTranslations("Producer");
  return <PlaceholderPage title={t("title")} />;
}
