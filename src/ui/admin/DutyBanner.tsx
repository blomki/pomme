import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import type { PlanningBanner } from "@/server/duty-planning";

import { LinkButton } from "../navigation/LinkButton";
import { m3 } from "../theme/create-theme";

import { PendingNotice } from "./PendingNotice";

/**
 * Bandeau « Prochain trimestre » de « Planning des permanences » (écran A3, stories G1 et G2) :
 * avancement des réponses, état du planning, liens vers les réponses et l'éditeur ; puis les
 * changements enregistrés sans prévenir.
 */
export function DutyBanner({
  amapSlug,
  quarter,
  banner,
}: {
  amapSlug: string;
  quarter: string;
  banner: PlanningBanner;
}) {
  const t = useTranslations("Admin.dutyPlanning");
  const base = `/${amapSlug}/admin/planning`;
  const generated = banner.planStatus === "draft" || banner.planStatus === "sent";
  return (
    <Stack spacing={2}>
      <Paper
        component="section"
        aria-label={t("bannerLabel")}
        elevation={0}
        sx={{
          p: 2.5,
          bgcolor: m3("surfaceContainer"),
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Stack spacing={0.75} sx={{ minWidth: 260 }}>
          <Typography
            variant="labelLarge"
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
          >
            {t("bannerKicker", { quarter })}
          </Typography>
          <Typography>
            {t("bannerAnswers", { answered: banner.answered, total: banner.total })} ·{" "}
            {t(`status_${banner.planStatus}`)}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={banner.total === 0 ? 0 : (banner.answered / banner.total) * 100}
            aria-hidden
            sx={{ maxWidth: 300 }}
          />
        </Stack>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5 }}>
          <LinkButton href={`${base}/disponibilites`} variant="outlined">
            {t("seeAnswers")}
          </LinkButton>
          <LinkButton href={`${base}/permanences?trimestre=prochain`} variant="contained">
            {generated ? t("open") : t("generate")}
          </LinkButton>
        </Stack>
      </Paper>
      {banner.pending.map((p) => (
        <PendingNotice key={p.planId} amapSlug={amapSlug} planId={p.planId} names={p.names} />
      ))}
    </Stack>
  );
}
