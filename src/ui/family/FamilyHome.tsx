"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatEuros } from "@/domain/catalog";
import type { MembershipState } from "@/domain/memberships";
import { formatDate } from "@/i18n/dates";
import type { HomePeriodView, NextDistribution } from "@/server/family-home";

import { m3 } from "../theme/create-theme";
import { visuallyHidden } from "../visually-hidden";

const monthName = (month: string) => formatDate(`${month}-01T12:00:00Z`, "MMMM");
const longDay = (day: string) => formatDate(`${day}T12:00:00Z`, "EEEE d MMMM");

/**
 * Accueil de la famille (écran 1, story D6) : où en est la commande du mois (ouverte sans
 * commande, ouverte avec commande, clôturée), prochaine distribution avec ce que le foyer y
 * retire, rappel d'adhésion.
 */
export function FamilyHome({
  amapSlug,
  title,
  membership,
  period,
  nextDistribution,
}: {
  amapSlug: string;
  title: string;
  membership: MembershipState;
  period: HomePeriodView | null;
  nextDistribution: NextDistribution | null;
}) {
  const t = useTranslations("Family.home");
  const base = `/${amapSlug}/famille`;

  return (
    <Stack spacing={3}>
      {/* Titre pour les lecteurs d'écran : à l'œil, la barre du haut nomme déjà l'AMAP. */}
      <Typography variant="h1" sx={visuallyHidden}>
        {title}
      </Typography>

      {membership.status === "expiring" && membership.date && (
        <Alert severity="warning">
          {t("membershipExpiring", { date: longDay(membership.date) })}
        </Alert>
      )}
      {membership.status !== "active" && membership.status !== "expiring" && (
        <Alert severity="warning">{t("membershipEnded")}</Alert>
      )}

      <PeriodCard base={base} period={period} />

      {nextDistribution && (
        <Paper
          component="section"
          aria-labelledby="prochaine-distribution"
          elevation={0}
          sx={{ p: 3, bgcolor: m3("surfaceContainer") }}
        >
          <Stack spacing={1.5}>
            <Box>
              <Typography id="prochaine-distribution" variant="titleLarge" component="h2">
                {t("nextDistribution")}
              </Typography>
              <Typography color="text.secondary">
                {t("nextWhen", {
                  date: longDay(nextDistribution.date),
                  start: nextDistribution.startTime.replace(":", " h "),
                  end: nextDistribution.endTime.replace(":", " h "),
                })}
              </Typography>
              {nextDistribution.place && (
                <Typography color="text.secondary">{nextDistribution.place}</Typography>
              )}
            </Box>
            {nextDistribution.lines.length === 0 ? (
              <Typography>{t("nothingToCollect")}</Typography>
            ) : (
              <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
                {nextDistribution.lines.map((line) => (
                  <Stack
                    component="li"
                    key={`${line.producer}-${line.product}`}
                    direction="row"
                    sx={{ justifyContent: "space-between", gap: 2 }}
                  >
                    <span>{t("line", { product: line.product, quantity: line.quantity })}</span>
                    <Typography component="span" color="text.secondary" sx={{ textAlign: "right" }}>
                      {line.producer}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
            <Typography>
              {t("report")}{" "}
              <MuiLink component={Link} href={`${base}/signalement`}>
                {t("reportLink")}
              </MuiLink>
            </Typography>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

/** Carte de la commande du mois, selon l'état de la période. */
function PeriodCard({ base, period }: { base: string; period: HomePeriodView | null }) {
  const t = useTranslations("Family.home");
  if (!period) return <Typography>{t("noPeriod")}</Typography>;

  const month = monthName(period.month);
  let label: string;
  let title: string;
  let text: string;
  let actions: React.ReactNode;

  if (period.phase === "open" && period.chequeCount === 0) {
    label = t("openLabel", { date: longDay(period.closesOn) });
    title = t("openEmptyTitle", { month });
    text = t("openEmptyText", { treated: period.treated, count: period.producerCount });
    actions = (
      <Button variant="contained" component={Link} nativeButton={false} href={`${base}/commande`}>
        {t("order")}
      </Button>
    );
  } else if (period.phase === "open") {
    label = t("openLabel", { date: longDay(period.closesOn) });
    title = t("openOrderedTitle", { month });
    text = t("openOrderedText", {
      count: period.chequeCount,
      total: formatEuros(period.totalCents),
      date: longDay(period.closesOn),
    });
    actions = (
      <>
        <Button variant="contained" component={Link} nativeButton={false} href={`${base}/commande`}>
          {t("editOrder")}
        </Button>
        <Button
          variant="outlined"
          component={Link}
          nativeButton={false}
          href={`${base}/commande/recapitulatif`}
        >
          {t("chequeList")}
        </Button>
      </>
    );
  } else if (period.phase === "closed") {
    label = t("closedLabel");
    title = t("closedTitle", { month });
    text = [
      t("closedText", { count: period.chequeCount, total: formatEuros(period.totalCents) }),
      period.handOverOn && period.chequeCount > 0
        ? t("closedHandOver", { date: longDay(period.handOverOn) })
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    actions =
      period.chequeCount > 0 ? (
        <Button variant="contained" component={Link} nativeButton={false} href={`${base}/cheques`}>
          {t("chequeList")}
        </Button>
      ) : null;
  } else {
    label = t("scheduledLabel");
    title = t("scheduledTitle", { month });
    text = t("scheduledText", { date: longDay(period.opensOn) });
    actions = null;
  }

  return (
    <Paper
      component="section"
      aria-labelledby="commande-du-mois"
      elevation={0}
      sx={{ p: 3, bgcolor: m3("primaryContainer"), color: m3("onPrimaryContainer") }}
    >
      <Stack spacing={1.5}>
        <Typography
          variant="labelLarge"
          sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
        >
          {label}
        </Typography>
        <Typography id="commande-du-mois" variant="headlineSmall" component="h2">
          {title}
        </Typography>
        <Typography>{text}</Typography>
        {actions && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            {actions}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
