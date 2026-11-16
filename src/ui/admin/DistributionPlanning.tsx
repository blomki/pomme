"use client";

import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { addMonths, WEEKDAYS } from "@/domain/distributions";
import { formatDate } from "@/i18n/dates";
import type { DistributionSettings, DistributionView } from "@/server/distributions";
import {
  generateDistributionsAction,
  saveDistributionSettingsAction,
  setDistributionOpenAction,
} from "@/server/distributions-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

/** Un jour du calendrier (« 2026-12-08 ») affiché en français, sans effet de fuseau. */
const day = (date: string, pattern: string) => formatDate(`${date}T12:00:00Z`, pattern);
const monthLabel = (month: string) => day(`${month}-01`, "MMMM yyyy");

/**
 * Calendrier des distributions d'un mois (story D1), dans « Planning des permanences » :
 * distribution habituelle, puis chaque distribution, ouverte ou fermée avec son motif.
 */
export function DistributionPlanning({
  amapSlug,
  month,
  settings,
  distributions,
}: {
  amapSlug: string;
  month: string;
  settings: DistributionSettings;
  distributions: DistributionView[];
}) {
  const t = useTranslations("Admin.planning");
  const tw = useTranslations("Weekdays");
  const showSnackbar = useSnackbar();
  const [editingSettings, setEditingSettings] = useState(false);
  const [closing, setClosing] = useState<DistributionView | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/${amapSlug}/admin/planning`;
  const label = monthLabel(month);
  const configured = settings.weekday !== null && settings.startTime !== "";
  const openCount = distributions.filter((d) => d.isOpen).length;

  const generate = async () => {
    setPending(true);
    const result = await generateDistributionsAction(amapSlug, month);
    setPending(false);
    if (result.status === "generated") {
      showSnackbar({ message: t("generated", { count: result.created }) });
    } else {
      showSnackbar({
        message:
          result.status === "no_settings"
            ? t("noSettings")
            : result.status === "forbidden"
              ? t("forbidden")
              : t("error"),
      });
    }
  };

  const reopen = async (distribution: DistributionView) => {
    const date = day(distribution.date, "EEEE d MMMM");
    const result = await setDistributionOpenAction(amapSlug, {
      distributionId: distribution.id,
      open: true,
    });
    showSnackbar({ message: result.status === "updated" ? t("reopened", { date }) : t("error") });
  };

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 3 }}>
        <Typography
          variant="h2"
          sx={{ flexGrow: 1, "&::first-letter": { textTransform: "uppercase" } }}
        >
          {label}
        </Typography>
        <IconButton
          component={Link}
          nativeButton={false}
          href={`${base}?mois=${addMonths(month, -1)}`}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          component={Link}
          nativeButton={false}
          href={`${base}?mois=${addMonths(month, 1)}`}
          aria-label={t("nextMonth")}
        >
          <ChevronRight />
        </IconButton>
      </Stack>

      <Paper
        variant="outlined"
        component="section"
        aria-labelledby="usual-title"
        sx={{ p: 3, mb: 4 }}
      >
        <Typography id="usual-title" variant="titleLarge" component="h3" sx={{ mb: 1 }}>
          {t("usualTitle")}
        </Typography>
        {configured ? (
          <Typography>
            {t("usual", {
              weekday: tw(String(settings.weekday) as "1"),
              start: settings.startTime,
              end: settings.endTime,
            })}
          </Typography>
        ) : (
          <Typography sx={{ color: "error.main" }}>{t("usualMissing")}</Typography>
        )}
        <Typography sx={{ color: settings.place ? "text.primary" : "text.secondary" }}>
          {settings.place ? t("place", { place: settings.place }) : t("noPlace")}
        </Typography>
        <Button onClick={() => setEditingSettings(true)} sx={{ mt: 1, ml: -1 }}>
          {t("editSettings")}
        </Button>
      </Paper>

      <Box component="section" aria-labelledby="distributions-title">
        <Stack
          direction="row"
          spacing={2}
          sx={{ mb: 2, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <Typography id="distributions-title" variant="titleLarge" component="h3">
            {t("distributionsTitle")}
          </Typography>
          <Typography sx={{ color: "text.secondary" }}>
            {t("openCount", { count: openCount, month: label })}
          </Typography>
        </Stack>

        {distributions.length === 0 ? (
          <Typography sx={{ mb: 2 }}>{t("none", { month: label })}</Typography>
        ) : (
          <Paper variant="outlined" component="ol" sx={{ listStyle: "none", m: 0, p: 0, mb: 2 }}>
            {distributions.map((d, index) => {
              const date = day(d.date, "EEEE d MMMM");
              return (
                <Box
                  component="li"
                  key={d.id}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "11rem 7rem 1fr auto" },
                    gap: 2,
                    alignItems: "center",
                    px: 2,
                    py: 1.5,
                    borderTop: index === 0 ? 0 : 1,
                    borderColor: "divider",
                  }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>
                      {t("week", { number: index + 1 })}
                    </Typography>
                    <Typography variant="bodySmall" sx={{ color: "text.secondary" }}>
                      {date} · {d.startTime}–{d.endTime}
                    </Typography>
                  </Box>
                  <Box>
                    <Chip
                      size="small"
                      variant={d.isOpen ? "filled" : "outlined"}
                      label={d.isOpen ? t("open") : t("closed")}
                    />
                  </Box>
                  <Typography sx={{ color: "text.secondary" }}>
                    {d.isOpen ? "" : t("reason", { reason: d.closedReason ?? "" })}
                  </Typography>
                  {d.isOpen ? (
                    <Button
                      size="small"
                      onClick={() => setClosing(d)}
                      aria-label={t("closeOf", { date })}
                    >
                      {t("close")}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => void reopen(d)}
                      aria-label={t("reopenOf", { date })}
                    >
                      {t("reopen")}
                    </Button>
                  )}
                </Box>
              );
            })}
          </Paper>
        )}

        <Button
          variant={distributions.length === 0 ? "contained" : "outlined"}
          onClick={() => void generate()}
          disabled={pending || !configured}
        >
          {distributions.length === 0 ? t("generate", { month: label }) : t("generateMissing")}
        </Button>
        {!configured && (
          <Typography variant="bodySmall" sx={{ color: "text.secondary", mt: 1 }}>
            {t("noSettings")}
          </Typography>
        )}
        <Typography variant="bodySmall" component="p" sx={{ color: "text.secondary", mt: 3 }}>
          {t("note")}
        </Typography>
      </Box>

      {editingSettings && (
        <SettingsDialog
          amapSlug={amapSlug}
          settings={settings}
          onClose={() => setEditingSettings(false)}
        />
      )}
      {closing && (
        <CloseDialog
          key={closing.id}
          amapSlug={amapSlug}
          distribution={closing}
          onClose={() => setClosing(null)}
        />
      )}
    </>
  );
}

/** Fermeture d'une distribution : le motif est obligatoire. */
function CloseDialog({
  amapSlug,
  distribution,
  onClose,
}: {
  amapSlug: string;
  distribution: DistributionView;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.planning");
  const showSnackbar = useSnackbar();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const date = day(distribution.date, "EEEE d MMMM");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await setDistributionOpenAction(amapSlug, {
      distributionId: distribution.id,
      open: false,
      reason,
    });
    setPending(false);
    if (result.status === "updated") {
      showSnackbar({ message: t("closedDone", { date }) });
      onClose();
      return;
    }
    setProblem(result.status === "reason_required" ? t("reasonRequired") : t("error"));
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="close-title" fullWidth maxWidth="sm">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle id="close-title">{t("closeTitle", { date })}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("closeIntro")}</DialogContentText>
          <TextField
            label={t("reasonLabel")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            fullWidth
            autoComplete="off"
            error={problem !== null}
            helperText={problem ?? " "}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("confirmClose")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Réglages de la distribution habituelle : jour, horaires, lieu. */
function SettingsDialog({
  amapSlug,
  settings,
  onClose,
}: {
  amapSlug: string;
  settings: DistributionSettings;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.planning");
  const tw = useTranslations("Weekdays");
  const showSnackbar = useSnackbar();
  const [weekday, setWeekday] = useState(settings.weekday ? String(settings.weekday) : "");
  const [startTime, setStartTime] = useState(settings.startTime || "18:00");
  const [endTime, setEndTime] = useState(settings.endTime || "19:30");
  const [place, setPlace] = useState(settings.place);
  // Coché par défaut : changer de jour sans déplacer les distributions à venir obligerait à les
  // fermer une à une (retour de recette du 2026-11-16).
  const [moveUpcoming, setMoveUpcoming] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await saveDistributionSettingsAction(amapSlug, {
      weekday,
      startTime,
      endTime,
      place,
      moveUpcoming,
    });
    setPending(false);
    if (result.status === "saved") {
      const parts = [t("saved")];
      if (moveUpcoming) parts.push(t("moved", { count: result.moved }));
      if (result.skipped.length > 0) {
        parts.push(
          t("skipped", {
            count: result.skipped.length,
            dates: result.skipped.map((d) => day(d, "d MMMM")).join(", "),
          }),
        );
      }
      showSnackbar({ message: parts.join(" ") });
      onClose();
      return;
    }
    setInvalid(true);
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="settings-title" fullWidth maxWidth="sm">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle id="settings-title">{t("settingsTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("settingsIntro")}</DialogContentText>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              label={t("weekday")}
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
              required
            >
              {WEEKDAYS.map((d) => (
                <MenuItem key={d} value={String(d)} sx={{ textTransform: "capitalize" }}>
                  {tw(String(d) as "1")}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField
                label={t("startTime")}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label={t("endTime")}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                fullWidth
              />
            </Stack>
            <TextField
              label={t("placeLabel")}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              fullWidth
            />
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={moveUpcoming}
                    onChange={(e) => setMoveUpcoming(e.target.checked)}
                    slotProps={{ input: { "aria-describedby": "move-upcoming-help" } }}
                  />
                }
                label={t("moveUpcoming")}
              />
              <FormHelperText id="move-upcoming-help" sx={{ mt: -0.5, ml: 4 }}>
                {t("moveUpcomingHelp")}
              </FormHelperText>
            </Box>
            <div role="status" aria-live="polite">
              {invalid && <Alert severity="error">{t("invalidSettings")}</Alert>}
            </div>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
