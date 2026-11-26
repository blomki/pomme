import Stack from "@mui/material/Stack";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { quarterLabel } from "@/server/duty-notices";
import { getPlanningEditor, type QuarterChoice } from "@/server/duty-planning";
import { PlanningEditor } from "@/ui/admin/PlanningEditor";
import { LinkButton } from "@/ui/navigation/LinkButton";
import { PageBanner } from "@/ui/layout/PageBanner";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ trimestre?: string }>;
};

// [domaine]/<amap>/admin/planning/permanences?trimestre=en-cours|prochain : éditeur du planning
// des permanences (story G2, écran A3). Le prochain trimestre par défaut.
export default async function PlanningEditorPage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const { trimestre } = await searchParams;
  const quarter: QuarterChoice = trimestre === "en-cours" ? "current" : "next";
  const { ctx } = await requireAmapAdminPage(slug);
  const view = await withAmapContext(getDatabase(), ctx, (tx, c) =>
    getPlanningEditor(tx, c, quarter),
  );
  const t = await getTranslations("Admin.dutyPlanning");
  const tb = await getTranslations("Banners");
  const base = `/${slug}/admin/planning`;
  return (
    <Stack spacing={2} sx={{ maxWidth: 1100 }}>
      <LinkButton href={base} sx={{ alignSelf: "flex-start" }}>
        {t("back")}
      </LinkButton>
      <PageBanner title={t("title", { quarter: quarterLabel(view.quarterStart) })}>
        {tb("dutyPlan")}
      </PageBanner>
      <Stack
        direction="row"
        sx={{ justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 2 }}
      >
        <Stack direction="row" role="group" aria-label={t("quarterGroup")} sx={{ gap: 1 }}>
          <LinkButton
            href={`${base}/permanences?trimestre=en-cours`}
            variant={quarter === "current" ? "contained" : "outlined"}
            aria-current={quarter === "current" ? "page" : undefined}
          >
            {t("current")}
          </LinkButton>
          <LinkButton
            href={`${base}/permanences?trimestre=prochain`}
            variant={quarter === "next" ? "contained" : "outlined"}
            aria-current={quarter === "next" ? "page" : undefined}
          >
            {t("next")}
          </LinkButton>
        </Stack>
      </Stack>
      <PlanningEditor
        key={`${view.quarterStart}-${view.plan?.status ?? "none"}-${JSON.stringify(view.months)}`}
        amapSlug={slug}
        view={view}
      />
    </Stack>
  );
}
