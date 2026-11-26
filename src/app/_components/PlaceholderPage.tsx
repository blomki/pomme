import { useTranslations } from "next-intl";
import { PageBanner } from "@/ui/layout/PageBanner";

/** Page provisoire d'un écran pas encore développé : son titre et « Écran en construction ». */
export function PlaceholderPage({ title }: { title: string }) {
  const t = useTranslations("Common");
  return <PageBanner title={title}>{t("underConstruction")}</PageBanner>;
}
