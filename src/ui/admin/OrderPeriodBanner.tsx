"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { DatesError } from "@/domain/order-periods";
import { formatDate } from "@/i18n/dates";
import type { OrderPeriodView } from "@/server/order-periods";
import {
  closeOrderPeriodAction,
  remindHouseholdsAction,
  reopenOrderPeriodAction,
  saveOrderPeriodDatesAction,
} from "@/server/order-periods-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";

/** Un jour du calendrier (« 2026-11-25 ») affiché en français, sans effet de fuseau. */
const day = (date: string, pattern = "d MMMM") => formatDate(`${date}T12:00:00Z`, pattern);

type Dialogs = "dates" | "close" | "reopen" | "remind" | null;

/**
 * Bandeau « Commandes de [mois] » du tableau de bord admin (story D2) : dates de la période,
 * foyers qui ont commandé, et les actions de l'état en cours (fixer ou modifier les dates,
 * relancer, clôturer, rouvrir).
 */
export function OrderPeriodBanner({
  amapSlug,
  period,
}: {
  amapSlug: string;
  period: OrderPeriodView;
}) {
  const t = useTranslations("Admin.orders");
  const [dialog, setDialog] = useState<Dialogs>(null);
  const month = day(`${period.month}-01`, "MMMM");
  const dates = { opensOn: day(period.opensOn), closesOn: day(period.closesOn) };
  const summary =
    period.status === "none"
      ? t("none", dates)
      : period.status === "scheduled"
        ? t("scheduled", dates)
        : period.status === "open"
          ? period.reopened
            ? t("reopened", dates)
            : t("open", dates)
          : t("closed", { closedOn: day(period.closedOn ?? period.closesOn) });
  const showProgress = period.status === "open" || period.status === "closed";
  const close = () => setDialog(null);

  return (
    <Paper
      component="section"
      aria-labelledby="orders-title"
      sx={{ p: 3, mb: 4, bgcolor: m3("surfaceContainer") }}
      elevation={0}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography
            id="orders-title"
            variant="titleLarge"
            component="h2"
            sx={{ "&::first-letter": { textTransform: "uppercase" } }}
          >
            {t("title", { month })}
          </Typography>
          <Typography>{summary}</Typography>
          {showProgress && (
            <Typography sx={{ color: "text.secondary" }}>
              {t("progress", { ordered: period.orderedHouseholds, total: period.activeHouseholds })}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }} useFlexGap>
          {period.status === "none" && (
            <Button variant="contained" onClick={() => setDialog("dates")}>
              {t("setDates")}
            </Button>
          )}
          {(period.status === "scheduled" || period.status === "open") && (
            <Button variant="outlined" onClick={() => setDialog("dates")}>
              {t("editDates")}
            </Button>
          )}
          {period.status === "open" && (
            <>
              <Button variant="outlined" onClick={() => setDialog("remind")}>
                {t("remind")}
              </Button>
              <Button variant="outlined" onClick={() => setDialog("close")}>
                {t("closeNow")}
              </Button>
            </>
          )}
          {period.status === "closed" && (
            <Button variant="contained" onClick={() => setDialog("reopen")}>
              {t("reopen")}
            </Button>
          )}
        </Stack>
      </Stack>

      {dialog === "dates" && (
        <DatesDialog amapSlug={amapSlug} period={period} month={month} onClose={close} />
      )}
      {dialog === "close" && period.id && (
        <CloseDialog amapSlug={amapSlug} periodId={period.id} month={month} onClose={close} />
      )}
      {dialog === "reopen" && period.id && (
        <ReopenDialog amapSlug={amapSlug} periodId={period.id} month={month} onClose={close} />
      )}
      {dialog === "remind" && period.id && (
        <RemindDialog
          amapSlug={amapSlug}
          periodId={period.id}
          waiting={period.activeHouseholds - period.orderedHouseholds}
          onClose={close}
        />
      )}
    </Paper>
  );
}

// Pendant l'envoi, les boutons restent actifs (un deuxième clic est ignoré) : un bouton
// désactivé perdrait le focus, et la fenêtre ne se fermerait plus avec Échap au clavier.

/** Messages d'erreur d'une saisie de dates, dans l'ordre des champs. */
function useDatesErrors() {
  const t = useTranslations("Admin.orders.errors");
  return (errors: readonly (DatesError | "closed")[]) => errors.map((e) => t(e)).join(" ");
}

/** Jours d'ouverture et de clôture (création ou modification). */
function DatesDialog({
  amapSlug,
  period,
  month,
  onClose,
}: {
  amapSlug: string;
  period: OrderPeriodView;
  month: string;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.orders");
  const describe = useDatesErrors();
  const showSnackbar = useSnackbar();
  const [opensOn, setOpensOn] = useState(period.opensOn);
  const [closesOn, setClosesOn] = useState(period.closesOn);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isOpen = period.status === "open";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    const result = await saveOrderPeriodDatesAction(amapSlug, {
      month: period.month,
      opensOn,
      closesOn,
    });
    setPending(false);
    if (result.status === "saved") {
      showSnackbar({ message: t("datesSaved", { month }) });
      onClose();
      return;
    }
    setProblem(
      result.status === "invalid"
        ? describe(result.errors)
        : result.status === "closed"
          ? describe(["closed"])
          : t("errors.forbidden"),
    );
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="dates-title" fullWidth maxWidth="sm">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle id="dates-title">{t("datesTitle", { month })}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {isOpen ? t("datesOpenIntro") : t("datesIntro")}
          </DialogContentText>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t("opensOn")}
              type="date"
              value={opensOn}
              onChange={(e) => setOpensOn(e.target.value)}
              disabled={isOpen}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label={t("closesOn")}
              type="date"
              value={closesOn}
              onChange={(e) => setClosesOn(e.target.value)}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <Box role="status" aria-live="polite" sx={{ mt: 2 }}>
            {problem && <Alert severity="error">{problem}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained">
            {t("save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Confirmation de « Clôturer maintenant ». */
function CloseDialog({
  amapSlug,
  periodId,
  month,
  onClose,
}: {
  amapSlug: string;
  periodId: string;
  month: string;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.orders");
  const showSnackbar = useSnackbar();
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    const result = await closeOrderPeriodAction(amapSlug, periodId);
    setPending(false);
    showSnackbar({
      message:
        result.status === "closed"
          ? t("closedNow", { month, count: result.cheques })
          : result.status === "forbidden"
            ? t("errors.forbidden")
            : t("errors.notOpen"),
    });
    onClose();
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="close-title" fullWidth maxWidth="sm">
      <DialogTitle id="close-title">{t("closeTitle", { month })}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("closeIntro")}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button variant="contained" onClick={() => void confirm()}>
          {t("confirmClose")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** « Rouvrir les commandes » : nouveau jour de clôture. */
function ReopenDialog({
  amapSlug,
  periodId,
  month,
  onClose,
}: {
  amapSlug: string;
  periodId: string;
  month: string;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.orders");
  const describe = useDatesErrors();
  const showSnackbar = useSnackbar();
  const [closesOn, setClosesOn] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    const result = await reopenOrderPeriodAction(amapSlug, { periodId, closesOn });
    setPending(false);
    if (result.status === "reopened") {
      showSnackbar({ message: t("reopenedNow", { month, closesOn: day(closesOn) }) });
      onClose();
      return;
    }
    setProblem(
      result.status === "invalid"
        ? describe(result.errors)
        : result.status === "forbidden"
          ? t("errors.forbidden")
          : t("errors.notClosed"),
    );
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="reopen-title" fullWidth maxWidth="sm">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle id="reopen-title">{t("reopenTitle", { month })}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("reopenIntro")}</DialogContentText>
          <TextField
            label={t("closesOn")}
            type="date"
            value={closesOn}
            onChange={(e) => setClosesOn(e.target.value)}
            required
            fullWidth
            sx={{ mt: 1 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box role="status" aria-live="polite" sx={{ mt: 2 }}>
            {problem && <Alert severity="error">{problem}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained">
            {t("confirmReopen")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Confirmation de « Relancer ». */
function RemindDialog({
  amapSlug,
  periodId,
  waiting,
  onClose,
}: {
  amapSlug: string;
  periodId: string;
  waiting: number;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.orders");
  const showSnackbar = useSnackbar();
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    const result = await remindHouseholdsAction(amapSlug, periodId);
    setPending(false);
    if (result.status === "sent") {
      const parts = [t("reminded", { sent: result.sent, skipped: result.skipped })];
      if (result.failed > 0) parts.push(t("remindFailed", { count: result.failed }));
      showSnackbar({ message: parts.join(" ") });
    } else {
      showSnackbar({
        message: result.status === "forbidden" ? t("errors.forbidden") : t("errors.notOpen"),
      });
    }
    onClose();
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="remind-title" fullWidth maxWidth="sm">
      <DialogTitle id="remind-title">{t("remindTitle")}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("remindIntro", { count: waiting })}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button variant="contained" onClick={() => void confirm()} disabled={waiting === 0}>
          {t("confirmRemind")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
