"use client";

import PrintOutlined from "@mui/icons-material/PrintOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import GlobalStyles from "@mui/material/GlobalStyles";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { formatEuros } from "@/domain/catalog";
import { formatDate } from "@/i18n/dates";
import type { FamilyCheques as FamilyChequesData } from "@/server/family-home";

import { m3 } from "../theme/create-theme";

/** Masqué sur papier : boutons, menus. */
const screenOnly = { "@media print": { display: "none" } } as const;

/**
 * Liste des chèques de la commande clôturée (stories D6 et E2) : un par producteur, montant à
 * écrire (avoirs déduits), ordre du chèque à la demande, reçu ou non ; puis « Rien ce mois-ci ».
 * « Imprimer la liste » : sur papier, sans menus, en noir sur blanc, avec l'ordre de chaque
 * chèque (on remplit les chèques à partir de la feuille).
 */
export function FamilyCheques({
  amapSlug,
  amapName,
  cheques,
}: {
  amapSlug: string;
  amapName: string;
  cheques: Exclude<FamilyChequesData, { state: "no_household" }>;
}) {
  const t = useTranslations("Family.cheques");
  const [openPayees, setOpenPayees] = useState<Set<string>>(new Set());
  const monthLabel =
    cheques.state === "closed" ? formatDate(`${cheques.month}-01T12:00:00Z`, "MMMM yyyy") : "";

  const togglePayee = (producer: string) =>
    setOpenPayees((all) => {
      const next = new Set(all);
      if (next.has(producer)) next.delete(producer);
      else next.add(producer);
      return next;
    });

  return (
    <Stack spacing={3}>
      {/* Sur papier : ni en-tête ni menu de l'application, et toujours noir sur blanc (en mode
          sombre, le texte clair sortirait presque invisible). */}
      <GlobalStyles
        styles={(theme) => ({
          "@media print": {
            "header, nav, a[href='#contenu']": { display: "none !important" },
            body: { backgroundColor: theme.palette.common.white },
            "*": { color: `${theme.palette.common.black} !important` },
          },
        })}
      />
      <Box>
        <Typography variant="h1">{t("title")}</Typography>
        {cheques.state === "closed" && (
          <>
            <Typography color="text.secondary">{t("subtitle", { month: monthLabel })}</Typography>
            {/* En tête de la feuille imprimée : pour qui, et pour quelle AMAP. */}
            <Typography sx={{ display: "none", "@media print": { display: "block" } }}>
              {t("printFor", { household: cheques.householdName, amap: amapName })}
            </Typography>
          </>
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

      {cheques.state === "closed" && cheques.ordersOpen && (
        <Stack spacing={1} sx={{ alignItems: "flex-start", ...screenOnly }}>
          <Typography>{t("alsoOpen")}</Typography>
          <Button
            variant="text"
            component={Link}
            nativeButton={false}
            href={`/${amapSlug}/famille/commande/recapitulatif`}
            sx={{ ml: -1 }}
          >
            {t("openLink")}
          </Button>
        </Stack>
      )}

      {cheques.state === "closed" && cheques.cheques.length > 0 && (
        <>
          <Stack
            direction="row"
            sx={{ ...screenOnly, flexWrap: "wrap", gap: 2, alignItems: "center" }}
          >
            <Button variant="outlined" startIcon={<PrintOutlined />} onClick={() => window.print()}>
              {t("print")}
            </Button>
            <Typography variant="bodySmall" color="text.secondary">
              {t("printHint")}
            </Typography>
          </Stack>
          {cheques.handOverOn && (
            <Typography>
              {t("handOver", {
                date: formatDate(`${cheques.handOverOn}T12:00:00Z`, "EEEE d MMMM"),
              })}
            </Typography>
          )}
          {cheques.cheques.map((c, index) => {
            const shown = openPayees.has(c.producer);
            const payeeId = `ordre-${index}`;
            return (
              <Paper
                key={c.producer}
                component="section"
                aria-label={c.producer}
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: m3("surfaceContainer"),
                  breakInside: "avoid",
                  "@media print": { border: 1, borderColor: "divider", bgcolor: "transparent" },
                }}
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
                {c.creditsCents > 0 && (
                  <Typography variant="bodyMedium" color="text.secondary">
                    {t("credit", {
                      gross: formatEuros(c.grossCents),
                      credit: formatEuros(c.creditsCents),
                    })}
                  </Typography>
                )}
                <Button
                  size="small"
                  sx={{ mt: 1, ml: -1, ...screenOnly }}
                  aria-expanded={shown}
                  aria-controls={payeeId}
                  onClick={() => togglePayee(c.producer)}
                >
                  {shown ? t("hidePayee") : t("showPayee")}
                </Button>
                {/* À la demande à l'écran ; toujours sur papier. */}
                <Typography
                  id={payeeId}
                  sx={{ display: shown ? "block" : "none", "@media print": { display: "block" } }}
                >
                  {c.checkPayee ? t("payee", { payee: c.checkPayee }) : t("payeeUnknown")}
                </Typography>
                <Chip
                  size="small"
                  label={t(`status.${c.status}`)}
                  variant={c.status === "expected" ? "outlined" : "filled"}
                  sx={{ mt: 1 }}
                />
              </Paper>
            );
          })}
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

      {cheques.state === "closed" && cheques.nothingThisMonth.length > 0 && (
        <Box component="section" aria-labelledby="rien-ce-mois-ci">
          <Typography id="rien-ce-mois-ci" variant="titleMedium" component="h2" sx={{ mb: 0.5 }}>
            {t("nothingTitle")}
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 1 }}>
            {t("nothingIntro")}
          </Typography>
          <Stack component="ul" sx={{ m: 0, pl: 3 }}>
            {cheques.nothingThisMonth.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
