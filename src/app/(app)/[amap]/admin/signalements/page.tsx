import Stack from "@mui/material/Stack";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { listAllCredits } from "@/server/credits";
import { getAdminReportForm, listAllReports } from "@/server/reports";
import { AdminReportForm } from "@/ui/reports/AdminReportForm";
import { CreditsHistory } from "@/ui/reports/CreditsHistory";
import { ReportsToTreat } from "@/ui/reports/ReportsToTreat";
import { PageBanner } from "@/ui/layout/PageBanner";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ distribution?: string }>;
};

// [domaine]/<amap>/admin/signalements?distribution=<id> : signalements de tous les producteurs,
// à traiter puis traités, et report des écarts de la feuille d'émargement (story F5, écran A5).
export default async function AdminReportsPage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const { distribution } = await searchParams;
  const { ctx } = await requireAmapAdminPage(slug);
  const t = await getTranslations("Reports.admin");
  const tb = await getTranslations("Banners");
  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => ({
    reports: await listAllReports(tx, c),
    credits: await listAllCredits(tx, c),
    form: await getAdminReportForm(tx, c, { distributionId: distribution }),
  }));
  const chosen = data.form.distributions.some((d) => d.id === distribution) ? distribution! : null;
  return (
    <Stack spacing={5}>
      <PageBanner title={t("pageTitle")}>{tb("adminReports")}</PageBanner>
      <ReportsToTreat amapSlug={slug} reports={data.reports} />
      {/* key : repart des foyers de la distribution choisie. */}
      <AdminReportForm
        key={chosen ?? "aucune"}
        amapSlug={slug}
        form={data.form}
        distributionId={chosen}
      />
      <CreditsHistory credits={data.credits} />
    </Stack>
  );
}
