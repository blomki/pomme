"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatEuros } from "@/domain/catalog";
import type { PaymentState } from "@/domain/producer-payments";
import { formatDate } from "@/i18n/dates";
import type { PaymentRow, ProducerPayments as Data } from "@/server/producer-payments";

import { m3 } from "../theme/create-theme";
import type { M3Role } from "../theme/m3-colors";

const amountStyle = { fontVariantNumeric: "tabular-nums" } as const;
const longDay = (date: string) => formatDate(`${date}T12:00:00Z`, "EEEE d MMMM");
const monthName = (month: string) => formatDate(`${month}-01T12:00:00Z`, "MMMM yyyy");

/** Pastille d'état d'un chèque, aux couleurs de l'écran de pointage du référent. */
const CHIP: Record<PaymentState, [M3Role, M3Role]> = {
  pending: ["surfaceContainerHighest", "onSurfaceVariant"],
  gap: ["tertiaryContainer", "onTertiaryContainer"],
  received: ["secondaryContainer", "onSecondaryContainer"],
  handed_over: ["surfaceContainerHigh", "onSurfaceVariant"],
};

/**
 * « Mes paiements » (story F4, écran P4), en lecture seule : le mois choisi (chèques reçus sur
 * le total, remise prévue), les chèques à suivre puis les chèques reçus, foyer par foyer, les
 * avoirs, et les mois précédents (un lien chacun).
 */
export function ProducerPayments({ amapName, data }: { amapName: string; data: Data }) {
  const t = useTranslations("Producer.payments");
  const chosen = data.chosen;
  const toFollow = chosen?.rows.filter((r) => r.state === "pending" || r.state === "gap") ?? [];
  const received = chosen?.rows.filter((r) => r.state === "received" || r.state === "handed_over");
  const others = data.months.filter((m) => m.month !== chosen?.month);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">{t("title")}</Typography>
        <Typography color="text.secondary">{t("subtitle", { amap: amapName })}</Typography>
      </Box>

      {!chosen ? (
        <Typography>{t("nothing")}</Typography>
      ) : (
        <>
          <Paper
            component="section"
            aria-labelledby="mois-choisi"
            elevation={0}
            sx={{ p: 2, bgcolor: m3("surfaceContainer") }}
          >
            <Stack
              direction="row"
              sx={{ justifyContent: "space-between", alignItems: "baseline", gap: 2 }}
            >
              <Typography
                id="mois-choisi"
                variant="titleLarge"
                component="h2"
                sx={{ "&::first-letter": { textTransform: "uppercase" } }}
              >
                {monthName(chosen.month)}
              </Typography>
              <Typography variant="bodyMedium" color="text.secondary">
                {t("progress", {
                  received: chosen.summary.received,
                  total: chosen.summary.total,
                })}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={(100 * chosen.summary.received) / Math.max(chosen.summary.total, 1)}
              aria-label={t("progressLabel")}
              sx={{ my: 1.5, height: 6, borderRadius: 3 }}
            />
            <Typography variant="bodyMedium">
              {t("expected", { amount: formatEuros(chosen.summary.expectedCents) })}
              {chosen.summary.creditsCents > 0 &&
                ` ${t("creditsDeducted", { amount: formatEuros(chosen.summary.creditsCents) })}`}
            </Typography>
            <Typography variant="bodyMedium" color="text.secondary">
              {chosen.handOver.kind === "handed"
                ? t("handedOn", { date: longDay(chosen.handOver.on) })
                : chosen.handOver.kind === "planned"
                  ? t("plannedOn", { date: longDay(chosen.handOver.on) })
                  : t("handOverUnknown")}
            </Typography>
          </Paper>

          <Rows id="a-suivre" title={t("toFollow")} rows={toFollow} empty={t("toFollowEmpty")} />
          {received && received.length > 0 && (
            <Rows id="recus" title={t("received")} rows={received} />
          )}
        </>
      )}

      {data.credits.length > 0 && (
        <Paper
          component="section"
          aria-labelledby="avoirs"
          variant="outlined"
          sx={{ p: 2, borderRadius: 3 }}
        >
          <Typography id="avoirs" variant="titleMedium" component="h2" sx={{ mb: 0.5 }}>
            {t("credits")}
          </Typography>
          <Typography variant="bodySmall" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {t("creditsHint")}
          </Typography>
          <List dense disablePadding>
            {data.credits.map((c) => (
              <ListItem key={c.id} disableGutters>
                <ListItemText
                  primary={`${c.householdName} · ${formatEuros(c.amountCents)}`}
                  secondary={
                    c.deductedMonth
                      ? t("creditDeducted", { month: monthName(c.deductedMonth) })
                      : t("creditPending")
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {others.length > 0 && (
        <Box component="section" aria-labelledby="autres-mois">
          <Typography id="autres-mois" variant="titleMedium" component="h2" sx={{ mb: 0.5 }}>
            {t("otherMonths")}
          </Typography>
          <List disablePadding>
            {others.map((m) => (
              <ListItem key={m.month} disablePadding divider>
                <ListItemButton
                  component={Link}
                  href={`/producteur/paiements?mois=${m.month}`}
                  sx={{ px: 1 }}
                >
                  <ListItemText
                    primary={t("monthLine", { month: monthName(m.month), count: m.total })}
                    secondary={
                      m.handedOverOn
                        ? t("handedOn", { date: longDay(m.handedOverOn) })
                        : t("progress", { received: m.received, total: m.total })
                    }
                    slotProps={{
                      primary: { sx: { "&::first-letter": { textTransform: "uppercase" } } },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Stack>
  );
}

/** Une liste de chèques, foyer par foyer : montant attendu, avoir déduit, état. */
function Rows({
  id,
  title,
  rows,
  empty,
}: {
  id: string;
  title: string;
  rows: PaymentRow[];
  empty?: string;
}) {
  const t = useTranslations("Producer.payments");
  return (
    <Box component="section" aria-labelledby={id}>
      <Typography id={id} variant="titleMedium" component="h2" sx={{ mb: 0.5 }}>
        {t("rowsTitle", { title, count: rows.length })}
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="bodyMedium" color="text.secondary">
          {empty}
        </Typography>
      ) : (
        <List disablePadding>
          {rows.map((r) => {
            const [background, text] = CHIP[r.state];
            const details = [
              r.creditsCents > 0 &&
                t("rowCredit", {
                  gross: formatEuros(r.grossCents),
                  credit: formatEuros(r.creditsCents),
                }),
              r.receivedCents !== null &&
                r.receivedCents !== r.expectedCents &&
                t("rowReceived", { amount: formatEuros(r.receivedCents) }),
            ].filter(Boolean);
            return (
              <ListItem key={r.id} disableGutters divider sx={{ gap: 1 }}>
                <ListItemText
                  primary={
                    <>
                      {r.householdName} ·{" "}
                      <Box component="span" sx={amountStyle}>
                        {formatEuros(r.expectedCents)}
                      </Box>
                    </>
                  }
                  secondary={details.length > 0 ? details.join(" · ") : undefined}
                />
                <Chip
                  size="small"
                  label={t(`state.${r.state}`)}
                  sx={{ bgcolor: m3(background), color: m3(text), fontWeight: 500, flexShrink: 0 }}
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
}
