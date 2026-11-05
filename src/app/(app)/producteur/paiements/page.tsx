import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../../_components/PlaceholderPage";

// Chèques attendus et reçus du producteur.
export default function ProducerPaymentsPage() {
  const t = useTranslations("Nav.producer");
  return <PlaceholderPage title={t("payments")} />;
}
