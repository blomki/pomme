import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapReferentPage } from "@/server/auth/guards";
import { listMyProducersCredits } from "@/server/credits";
import { listMyProducersReports } from "@/server/reports";
import { CreditsHistory } from "@/ui/reports/CreditsHistory";
import { ReportsToTreat } from "@/ui/reports/ReportsToTreat";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/referent/avoirs : signalements des producteurs suivis, à traiter (story F5),
// avoirs et leur historique (story F2, écran R4).
export default async function ReferentCreditsPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapReferentPage(slug);
  const t = await getTranslations("Reports.referent");
  const { reports, credits } = await withAmapContext(getDatabase(), ctx, async (tx, c) => ({
    reports: await listMyProducersReports(tx, c),
    credits: await listMyProducersCredits(tx, c),
  }));
  return (
    <Stack spacing={4}>
      <Typography variant="h1">{t("title")}</Typography>
      <ReportsToTreat amapSlug={slug} reports={reports} />
      <CreditsHistory credits={credits} />
    </Stack>
  );
}
