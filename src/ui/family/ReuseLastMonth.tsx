"use client";

import History from "@mui/icons-material/History";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { addMonths } from "@/domain/distributions";
import type { ReusePlan } from "@/domain/order-reuse";
import { formatDate } from "@/i18n/dates";
import { applyOrderReuseAction, previewOrderReuseAction } from "@/server/order-reuse-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

/**
 * « Reprendre ma commande de [mois] » (story D4) : montre d'abord ce qui sera recopié, et ce
 * qui ne peut pas l'être (produit plus au catalogue, semaine indisponible), puis recopie
 * seulement après confirmation.
 */
export function ReuseLastMonth({ amapSlug, month }: { amapSlug: string; month: string }) {
  const t = useTranslations("Family.order.reuse");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const previousLabel = formatDate(`${addMonths(month, -1)}-01T12:00:00Z`, "MMMM");
  const [plan, setPlan] = useState<ReusePlan | null>(null);
  const [empty, setEmpty] = useState(false);
  const [pending, setPending] = useState(false);

  const preview = async () => {
    setPending(true);
    const result = await previewOrderReuseAction(amapSlug);
    setPending(false);
    if (result.status === "ready") setPlan(result.plan);
    else if (result.status === "nothing") setEmpty(true);
    else showSnackbar({ message: t("error") });
  };

  const apply = async () => {
    setPending(true);
    const result = await applyOrderReuseAction(amapSlug);
    setPending(false);
    setPlan(null);
    if (result.status !== "applied") {
      showSnackbar({ message: t("error") });
      return;
    }
    showSnackbar({
      message: result.refused > 0 ? t("appliedPartly", { refused: result.refused }) : t("applied"),
    });
    router.refresh();
  };

  const list = (items: Array<{ name: string; producerName: string; quantity?: number }>) => (
    <Box component="ul" sx={{ m: 0, pl: 3 }}>
      {items.map((i) => (
        <li key={`${i.producerName}-${i.name}`}>
          {i.quantity !== undefined
            ? t("line", { product: i.name, producer: i.producerName, quantity: i.quantity })
            : t("lineNoQuantity", { product: i.name, producer: i.producerName })}
        </li>
      ))}
    </Box>
  );

  return (
    <>
      <Button
        variant="tonal"
        startIcon={<History />}
        disabled={pending}
        onClick={() => void preview()}
        sx={{ alignSelf: "stretch" }}
      >
        {t("button", { month: previousLabel })}
      </Button>
      {empty && <Alert severity="info">{t("nothing", { month: previousLabel })}</Alert>}
      <Dialog
        open={plan !== null}
        onClose={() => setPlan(null)}
        aria-labelledby="reprise-titre"
        fullWidth
      >
        <DialogTitle id="reprise-titre">{t("title", { month: previousLabel })}</DialogTitle>
        <DialogContent>
          {plan && plan.copied.length > 0 && (
            <Box component="section" aria-labelledby="reprise-copie" sx={{ mb: 2 }}>
              <Typography id="reprise-copie" variant="titleSmall" component="h3" sx={{ mb: 0.5 }}>
                {t("copied")}
              </Typography>
              {list(plan.copied)}
            </Box>
          )}
          {plan && plan.partial.length > 0 && (
            <Box component="section" aria-labelledby="reprise-partielle" sx={{ mb: 2 }}>
              <Typography
                id="reprise-partielle"
                variant="titleSmall"
                component="h3"
                sx={{ mb: 0.5 }}
              >
                {t("partial")}
              </Typography>
              {list(plan.partial)}
            </Box>
          )}
          {plan && plan.missing.length > 0 && (
            <Box component="section" aria-labelledby="reprise-absente" sx={{ mb: 2 }}>
              <Typography id="reprise-absente" variant="titleSmall" component="h3" sx={{ mb: 0.5 }}>
                {t("missing")}
              </Typography>
              {list(plan.missing)}
            </Box>
          )}
          <Typography variant="bodyMedium" color="text.secondary">
            {plan && plan.copied.length > 0 ? t("replaceNote") : t("nothingToCopy")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlan(null)}>{t("cancel")}</Button>
          {plan && plan.copied.length > 0 && (
            <Button variant="contained" disabled={pending} onClick={() => void apply()}>
              {t("confirm")}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
