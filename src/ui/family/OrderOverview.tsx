"use client";

import ChevronRight from "@mui/icons-material/ChevronRight";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatEuros } from "@/domain/catalog";
import { treatedCount, type ProducerOrderStatus } from "@/domain/orders";
import { formatDate } from "@/i18n/dates";
import type { OrderProducer } from "@/server/orders";

import { m3 } from "../theme/create-theme";

import { ReuseLastMonth } from "./ReuseLastMonth";

const STATUS_ROLES: Record<
  ProducerOrderStatus,
  [
    "primaryContainer" | "tertiaryContainer" | "surfaceContainerHighest",
    "onPrimaryContainer" | "onTertiaryContainer" | "onSurface",
  ]
> = {
  complete: ["primaryContainer", "onPrimaryContainer"],
  todo: ["tertiaryContainer", "onTertiaryContainer"],
  nothing: ["surfaceContainerHighest", "onSurface"],
};

/** Statut d'un producteur dans la commande : texte et couleur, jamais la couleur seule. */
export function OrderStatusChip({ status }: { status: ProducerOrderStatus }) {
  const t = useTranslations("Family.order.status");
  const [background, text] = STATUS_ROLES[status];
  return <Chip size="small" label={t(status)} sx={{ bgcolor: m3(background), color: m3(text) }} />;
}

/**
 * Écran 2 de la famille (story D3) : producteurs du mois avec leur statut et leur total,
 * avancement « N producteurs sur M traités », total provisoire et accès au récapitulatif.
 */
export function OrderOverview({
  amapSlug,
  month,
  closesOn,
  membershipActive,
  producers,
}: {
  amapSlug: string;
  month: string;
  closesOn: string;
  membershipActive: boolean;
  producers: OrderProducer[];
}) {
  const t = useTranslations("Family.order");
  const monthLabel = formatDate(`${month}-01T12:00:00Z`, "MMMM");
  const treated = treatedCount(producers.map((p) => p.status));
  const total = producers.reduce((sum, p) => sum + p.totalCents, 0);
  const base = `/${amapSlug}/famille/commande`;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">{t("title", { month: monthLabel })}</Typography>
        <Typography color="text.secondary">
          {t("editableUntil", { date: formatDate(`${closesOn}T12:00:00Z`, "EEEE d MMMM") })}
        </Typography>
      </Box>

      {!membershipActive && <Alert severity="warning">{t("membership")}</Alert>}

      {membershipActive && producers.length > 0 && (
        <ReuseLastMonth amapSlug={amapSlug} month={month} />
      )}

      {producers.length === 0 ? (
        <Typography>{t("noCatalog")}</Typography>
      ) : (
        <>
          <Box>
            <Typography id="progress-label" variant="titleMedium" component="p" sx={{ mb: 1 }}>
              {t("progress", { treated, count: producers.length })}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(treated / producers.length) * 100}
              aria-labelledby="progress-label"
            />
          </Box>

          <nav aria-label={t("producersLabel")}>
            <List disablePadding sx={{ display: "grid", gap: 1.5 }}>
              {producers.map((p) => (
                <ListItem key={p.amapProducerId} disablePadding>
                  <ListItemButton
                    component={Link}
                    href={`${base}/${p.amapProducerId}`}
                    sx={{ borderRadius: 3, bgcolor: m3("surfaceContainer"), py: 1.5 }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="titleMedium" component="span" sx={{ display: "block" }}>
                        {p.name}
                      </Typography>
                      {p.category && (
                        <Typography variant="bodyMedium" color="text.secondary" component="span">
                          {p.category}
                        </Typography>
                      )}
                    </Box>
                    <Stack spacing={0.5} sx={{ alignItems: "flex-end", ml: 2 }}>
                      <Typography
                        variant="titleMedium"
                        component="span"
                        sx={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {p.status === "todo" ? t("noAmount") : formatEuros(p.totalCents)}
                      </Typography>
                      <OrderStatusChip status={p.status} />
                    </Stack>
                    <ChevronRight aria-hidden="true" sx={{ ml: 1, color: "text.secondary" }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </nav>

          <Paper
            elevation={0}
            sx={{
              p: 2,
              bgcolor: m3("surfaceContainerHigh"),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Box>
              <Typography variant="bodyMedium" color="text.secondary">
                {t("provisionalTotal")}
              </Typography>
              <Typography
                variant="headlineSmall"
                component="p"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatEuros(total)}
              </Typography>
            </Box>
            <Button
              variant="contained"
              component={Link}
              nativeButton={false}
              href={`${base}/recapitulatif`}
            >
              {t("summary")}
            </Button>
          </Paper>
        </>
      )}
    </Stack>
  );
}
