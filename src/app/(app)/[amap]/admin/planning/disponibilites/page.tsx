import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { quarterLabel } from "@/server/duty-notices";
import { getDutyAdmin } from "@/server/duty-plans";
import { DutyAnswers } from "@/ui/admin/DutyAnswers";
import { LinkButton } from "@/ui/navigation/LinkButton";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/planning/disponibilites : disponibilités des amapiens pour les
// permanences du prochain trimestre (story G1, écran A8).
export default async function DutyAnswersPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const view = await withAmapContext(getDatabase(), ctx, (tx, c) => getDutyAdmin(tx, c));
  const t = await getTranslations("Admin.duty");
  return (
    <>
      <LinkButton href={`/${slug}/admin/planning`} sx={{ mb: 2 }}>
        {t("back")}
      </LinkButton>
      <Typography variant="h1" gutterBottom>
        {t("title", { quarter: quarterLabel(view.quarterStart) })}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t("intro", { count: view.distributionCount })}
      </Typography>
      <DutyAnswers key={view.plan?.id ?? "new"} amapSlug={slug} view={view} />
    </>
  );
}
