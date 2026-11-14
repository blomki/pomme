import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { requireAmapAdminPage } from "@/server/auth/guards";
import { InviteHouseholdForm } from "@/ui/admin/InviteHouseholdForm";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/foyers/nouveau : « Inviter un foyer » (story A2).
export default async function InviteHouseholdPage({ params }: Props) {
  const { amap: slug } = await params;
  await requireAmapAdminPage(slug);
  const t = await getTranslations("Admin.inviteHousehold");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 3, maxWidth: "70ch" }}>{t("intro")}</Typography>
      <InviteHouseholdForm amapSlug={slug} />
    </>
  );
}
