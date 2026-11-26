import { getTranslations } from "next-intl/server";

import { requireAmapAdminPage } from "@/server/auth/guards";
import { ImportData } from "@/ui/admin/ImportData";
import { LinkButton } from "@/ui/navigation/LinkButton";
import { PageBanner } from "@/ui/layout/PageBanner";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/reprise : reprise des données depuis AmapJ (story K1), réservée aux
// admins de l'AMAP.
export default async function ImportPage({ params }: Props) {
  const { amap: slug } = await params;
  await requireAmapAdminPage(slug);
  const t = await getTranslations("Admin.import");
  return (
    <>
      <LinkButton href={`/${slug}/admin/reglages`} sx={{ mb: 2 }}>
        {t("back")}
      </LinkButton>
      <PageBanner title={t("title")}>{t("intro")}</PageBanner>
      <ImportData amapSlug={slug} />
    </>
  );
}
