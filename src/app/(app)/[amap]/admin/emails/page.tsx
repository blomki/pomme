import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getEmailComposer } from "@/server/group-emails";
import { GroupEmail } from "@/ui/admin/GroupEmail";
import { PageBanner } from "@/ui/layout/PageBanner";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/emails : « Envoyer un email » (story H1, écran A9).
export default async function EmailsPage({ params }: Props) {
  const { amap: slug } = await params;
  const { amap, ctx } = await requireAmapAdminPage(slug);
  const view = await withAmapContext(getDatabase(), ctx, (tx, c) =>
    getEmailComposer(tx, c, { name: amap.name, slug: amap.slug, logoUrl: amap.logoUrl }),
  );
  const t = await getTranslations("Admin.emails");
  return (
    <>
      <PageBanner title={t("title")}>{t("intro")}</PageBanner>
      <GroupEmail amapSlug={slug} view={view} />
    </>
  );
}
