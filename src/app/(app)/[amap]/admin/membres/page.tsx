import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { listAmapMembers } from "@/server/members";
import { MembersTable } from "@/ui/admin/MembersTable";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/membres : personnes qui ont un rôle dans l'AMAP ; correction d'email.
export default async function MembersPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const members = await withAmapContext(getDatabase(), ctx, (tx, c) => listAmapMembers(tx, c));
  const t = await getTranslations("Admin.members");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 3 }}>{t("intro")}</Typography>
      <MembersTable amapSlug={slug} members={members} />
    </>
  );
}
