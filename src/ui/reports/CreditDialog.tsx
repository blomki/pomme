"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { formatEuros, parsePriceCents, priceInput } from "@/domain/catalog";
import { proposedCreditCents } from "@/domain/credits";
import type { ReportView } from "@/server/reports";
import { creditFromReportAction } from "@/server/reports-actions";

/**
 * « Créer un avoir » (story F2) : montant proposé = prix payé pour la quantité signalée,
 * ajustable ; pour un signalement « Autre », le référent confirme que le produit a été retiré
 * (jamais d'avoir pour un produit non retiré). L'avoir sera déduit du prochain chèque du foyer
 * chez ce producteur.
 */
export function CreditDialog({
  amapSlug,
  report,
  onClose,
  onCredited,
}: {
  amapSlug: string;
  report: ReportView;
  onClose: () => void;
  onCredited: (amountCents: number) => void;
}) {
  const t = useTranslations("Reports.credit");
  const proposed = proposedCreditCents(report.quantity, report.unitPriceCents);
  const [amount, setAmount] = useState(priceInput(proposed));
  const [pickedUp, setPickedUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const other = report.reason === "other";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const cents = parsePriceCents(amount);
    if (cents === null) return setError(t("errors.amount"));
    if (other && !pickedUp) return setError(t("errors.picked_up"));
    setPending(true);
    try {
      const result = await creditFromReportAction(amapSlug, {
        reportId: report.id,
        amountCents: cents,
        pickedUp,
      });
      if (result.status === "credited") return onCredited(cents);
      setError(
        result.status === "invalid"
          ? t(`errors.${result.problems[0] ?? "amount"}`)
          : t(`refused.${result.status}`),
      );
    } catch {
      setError(t("errors.network"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="avoir-titre">
      <Box component="form" onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle id="avoir-titre">
          {t("title", { household: report.householdName })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t("intro", {
              product: report.productName,
              quantity: report.quantity,
              producer: report.producerName,
              proposed: formatEuros(proposed),
            })}
          </DialogContentText>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              id="montant-avoir"
              label={t("amount")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              helperText={t("amountHelp")}
              slotProps={{
                input: { endAdornment: <InputAdornment position="end">€</InputAdornment> },
                htmlInput: { inputMode: "decimal" },
              }}
              sx={{ maxWidth: 240 }}
            />
            {other && (
              <FormControlLabel
                control={
                  <Checkbox checked={pickedUp} onChange={(e) => setPickedUp(e.target.checked)} />
                }
                label={t("pickedUp")}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("confirm")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
