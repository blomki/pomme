"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatEuros } from "@/domain/catalog";
import { formatDate } from "@/i18n/dates";
import type { FamilyCheques as FamilyChequesData } from "@/server/family-home";

import { m3 } from "../theme/create-theme";

/**
 * Liste des chèques de la commande clôturée (story D6) : un par producteur, montant à écrire
 * (avoirs déduits), ordre du chèque, reçu ou non. L'impression viendra avec E2.
 */
export function FamilyCheques({
  amapSlug,
  cheques,
}: {
  amapSlug: string;
  cheques: Exclude<FamilyChequesData, { state: "no_household" }>;
}) {
  const t = useTranslations("Family.cheques");
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">{t("title")}</Typography>
        {cheques.state === "closed" && (
          <Typography color="text.secondary">
            {t("subtitle", { month: formatDate(`${cheques.month}-01T12:00:00Z`, "MMMM") })}
          </Typography>
        )}
      </Box>

      {cheques.state === "open" && (
        <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
          <Typography>{t("open")}</Typography>
          <Button
            variant="contained"
            component={Link}
            nativeButton={false}
            href={`/${amapSlug}/famille/commande/recapitulatif`}
          >
            {t("openLink")}
          </Button>
        </Stack>
      )}
      {(cheques.state === "none" ||
        (cheques.state === "closed" && cheques.cheques.length === 0)) && (
        <Typography>{t("none")}</Typography>
      )}

      {cheques.state === "closed" && cheques.cheques.length > 0 && (
        <>
          {cheques.handOverOn && (
            <Typography>
              {t("handOver", {
                date: formatDate(`${cheques.handOverOn}T12:00:00Z`, "EEEE d MMMM"),
              })}
            </Typography>
          )}
          {cheques.cheques.map((c) => (
            <Paper
              key={c.producer}
              component="section"
              aria-label={c.producer}
              elevation={0}
              sx={{ p: 2, bgcolor: m3("surfaceContainer") }}
            >
              <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
                <Typography variant="titleMedium" component="h2">
                  {c.producer}
                </Typography>
                <Typography
                  variant="titleMedium"
                  component="p"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatEuros(c.expectedCents)}
                </Typography>
              </Stack>
              <Typography color="text.secondary">
                {c.checkPayee ? t("payee", { payee: c.checkPayee }) : t("payeeUnknown")}
              </Typography>
              {c.creditsCents > 0 && (
                <Typography variant="bodyMedium" color="text.secondary">
                  {t("credit", {
                    gross: formatEuros(c.grossCents),
                    credit: formatEuros(c.creditsCents),
                  })}
                </Typography>
              )}
              <Chip
                size="small"
                label={t(`status.${c.status}`)}
                variant={c.status === "expected" ? "outlined" : "filled"}
                sx={{ mt: 1 }}
              />
            </Paper>
          ))}
          <Divider />
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="titleMedium" component="p">
              {t("total")}
            </Typography>
            <Typography
              variant="titleMedium"
              component="p"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatEuros(cheques.cheques.reduce((sum, c) => sum + c.expectedCents, 0))}
            </Typography>
          </Stack>
        </>
      )}
    </Stack>
  );
}
