import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../../_components/PlaceholderPage";

// Catalogue du producteur (C2, C3).
export default function ProducerCataloguePage() {
  const t = useTranslations("Nav.producer");
  return <PlaceholderPage title={t("catalogue")} />;
}
