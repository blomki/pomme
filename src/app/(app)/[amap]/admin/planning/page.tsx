import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { parseMonth } from "@/domain/distributions";
import { formatDate } from "@/i18n/dates";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getDistributionSettings, listDistributions } from "@/server/distributions";
import { DistributionPlanning } from "@/ui/admin/DistributionPlanning";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ mois?: string }>;
};

// [domaine]/<amap>/admin/planning?mois=2026-12 : calendrier des distributions d'un mois (story
// D1). Les permanences (bénévoles) s'ajouteront à cet écran avec le planning trimestriel (G2).
export default async function PlanningPage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const { mois } = await searchParams;
  // Mois demandé, sinon le mois en cours à Paris.
  const month = parseMonth(mois ?? "") ?? formatDate(new Date(), "yyyy-MM");
  const { ctx } = await requireAmapAdminPage(slug);
  const { settings, distributions } = await withAmapContext(getDatabase(), ctx, async (tx, c) => ({
    settings: await getDistributionSettings(tx, c),
    distributions: await listDistributions(tx, c, month),
  }));
  const t = await getTranslations("Admin.planning");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <DistributionPlanning
        key={month}
        amapSlug={slug}
        month={month}
        settings={settings}
        distributions={distributions}
      />
    </>
  );
}
