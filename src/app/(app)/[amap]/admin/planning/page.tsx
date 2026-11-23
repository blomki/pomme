import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { parseMonth } from "@/domain/distributions";
import { formatDate } from "@/i18n/dates";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getDistributionSettings, listDistributions } from "@/server/distributions";
import { quarterLabel } from "@/server/duty-notices";
import { getPlanningBanner } from "@/server/duty-planning";
import { DistributionPlanning } from "@/ui/admin/DistributionPlanning";
import { DutyBanner } from "@/ui/admin/DutyBanner";
import { LinkButton } from "@/ui/navigation/LinkButton";

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
  const { settings, distributions, banner } = await withAmapContext(
    getDatabase(),
    ctx,
    async (tx, c) => ({
      settings: await getDistributionSettings(tx, c),
      distributions: await listDistributions(tx, c, month),
      banner: await getPlanningBanner(tx, c),
    }),
  );
  const t = await getTranslations("Admin.planning");
  const tp = await getTranslations("Admin.dutyPlanning");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      {/* Feuille d'émargement du mois affiché, prête à imprimer (story E3). */}
      {/* Prochain trimestre : réponses (G1) et planning des permanences (G2). */}
      <DutyBanner amapSlug={slug} quarter={quarterLabel(banner.quarterStart)} banner={banner} />
      <Stack direction="row" sx={{ my: 3, flexWrap: "wrap", gap: 1.5 }}>
        <LinkButton
          href={`/${slug}/admin/planning/permanences?trimestre=en-cours`}
          variant="outlined"
        >
          {tp("editCurrent")}
        </LinkButton>
        <LinkButton href={`/${slug}/emargement/${month}`} variant="outlined">
          {t("signInSheet", { month: formatDate(`${month}-01T12:00:00Z`, "MMMM yyyy") })}
        </LinkButton>
      </Stack>
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
