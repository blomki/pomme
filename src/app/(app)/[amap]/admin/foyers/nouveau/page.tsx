import { getTranslations } from "next-intl/server";

import { requireAmapAdminPage } from "@/server/auth/guards";
import { InviteHouseholdForm } from "@/ui/admin/InviteHouseholdForm";
import { PageBanner } from "@/ui/layout/PageBanner";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/foyers/nouveau : « Inviter un foyer » (story A2).
export default async function InviteHouseholdPage({ params }: Props) {
  const { amap: slug } = await params;
  await requireAmapAdminPage(slug);
  const t = await getTranslations("Admin.inviteHousehold");
  return (
    <>
      <PageBanner title={t("title")}>{t("intro")}</PageBanner>
      <InviteHouseholdForm amapSlug={slug} />
    </>
  );
}
