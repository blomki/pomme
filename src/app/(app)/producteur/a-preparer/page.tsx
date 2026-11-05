import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../../_components/PlaceholderPage";

// Quantités à préparer pour les prochaines distributions.
export default function ProducerToPreparePage() {
  const t = useTranslations("Nav.producer");
  return <PlaceholderPage title={t("toPrepare")} />;
}
