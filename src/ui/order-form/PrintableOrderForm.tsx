"use client";

import PrintOutlined from "@mui/icons-material/PrintOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import GlobalStyles from "@mui/material/GlobalStyles";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import { formatDate } from "@/i18n/dates";
import type { OrderFormView } from "@/server/order-forms";

import { OrderFormTables } from "./OrderFormTables";

/**
 * Bon de commande prêt à imprimer (story E1) : pas de menu, fond blanc à l'impression, un
 * bouton « Imprimer » qui disparaît sur le papier. « Enregistrer au format PDF », dans la
 * fenêtre d'impression du navigateur, en fait un PDF.
 */
export function PrintableOrderForm({
  amapName,
  view,
  validUntil,
}: {
  amapName: string;
  view: OrderFormView;
  validUntil: Date | null;
}) {
  const t = useTranslations("OrderForm");
  const month = formatDate(`${view.month}-01T12:00:00Z`, "MMMM yyyy");
  return (
    <>
      {/* Sur papier, toujours noir sur blanc : en mode sombre, le texte clair sortirait presque
          invisible (les navigateurs n'impriment pas les fonds par défaut). */}
      <GlobalStyles
        styles={(theme) => ({
          "@media print": {
            body: { backgroundColor: theme.palette.common.white },
            "*": { color: `${theme.palette.common.black} !important` },
          },
        })}
      />
      <Box
        component="main"
        id="contenu"
        sx={{
          maxWidth: 1000,
          mx: "auto",
          px: 3,
          py: 4,
          "@media print": {
            px: 0,
            py: 0,
            maxWidth: "none",
            color: "common.black",
            bgcolor: "common.white",
          },
        }}
      >
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 2,
            mb: 3,
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Typography variant="h1">{t("printTitle", { producer: view.producerName })}</Typography>
            <Typography color="text.secondary">
              {t("printSubtitle", { amap: amapName, month })}
              {view.period?.status !== "closed" ? ` · ${t("provisional")}` : ""}
            </Typography>
          </Box>
          <Stack spacing={1} sx={{ alignItems: "flex-end", "@media print": { display: "none" } }}>
            <Button
              variant="contained"
              startIcon={<PrintOutlined />}
              onClick={() => window.print()}
            >
              {t("printButton")}
            </Button>
            <Typography
              variant="bodySmall"
              color="text.secondary"
              sx={{ maxWidth: 320, textAlign: "right" }}
            >
              {t("printHint")}
            </Typography>
            {validUntil && (
              <Typography variant="bodySmall" color="text.secondary">
                {t("linkValidUntil", { date: formatDate(validUntil, "d MMMM yyyy") })}
              </Typography>
            )}
          </Stack>
        </Stack>
        <OrderFormTables form={view.form} />
      </Box>
    </>
  );
}
