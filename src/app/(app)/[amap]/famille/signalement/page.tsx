import { useTranslations } from "next-intl";

import { PlaceholderPage } from "../../../../_components/PlaceholderPage";

// Signaler un produit manquant ou abîmé (story F5, à venir). L'accueil y mène déjà (D6).
export default function FamilyReportPage() {
  const t = useTranslations("Family.report");
  return <PlaceholderPage title={t("title")} />;
}
