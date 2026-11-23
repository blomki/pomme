import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { requireAmapAdminPage } from "@/server/auth/guards";
import { ImportData } from "@/ui/admin/ImportData";
import { LinkButton } from "@/ui/navigation/LinkButton";

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
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 3, maxWidth: 820 }}>{t("intro")}</Typography>
      <ImportData amapSlug={slug} />
    </>
  );
}
