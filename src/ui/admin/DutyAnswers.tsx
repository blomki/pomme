"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { addDays } from "@/domain/order-periods";
import { DUTY_REMINDER_DAYS } from "@/domain/duty-plans";
import { formatDate } from "@/i18n/dates";
import { remindDutyAction, saveDutyPlanAction } from "@/server/duty-plans-actions";
import type { DutyAdminView } from "@/server/duty-plans";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";

const shortDay = (day: string) => formatDate(`${day}T12:00:00Z`, "d MMM");
const longDay = (day: string) => formatDate(`${day}T12:00:00Z`, "EEEE d MMMM");

type Filter = "all" | "no" | "yes";

/**
 * « Disponibilités du trimestre » (écran A8, story G1) : période de réponse, avancement,
 * relances groupée et individuelle, tableau des réponses.
 */
export function DutyAnswers({ amapSlug, view }: { amapSlug: string; view: DutyAdminView }) {
  const t = useTranslations("Admin.duty");
  const showSnackbar = useSnackbar();
  const [opensOn, setOpensOn] = useState(view.opensOn);
  const [deadlineOn, setDeadlineOn] = useState(view.deadlineOn);
  const [autoReminder, setAutoReminder] = useState(view.autoReminder);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, startTransition] = useTransition();

  const answered = view.rows.filter((r) => r.answeredOn !== null);
  const missing = view.rows.filter((r) => r.answeredOn === null);
  const rows = filter === "all" ? view.rows : filter === "no" ? missing : answered;
  const open = view.plan?.phase === "open";
  const total = view.rows.length;

  const save = () =>
    startTransition(async () => {
      const result = await saveDutyPlanAction(amapSlug, {
        quarterStart: view.quarterStart,
        opensOn,
        deadlineOn,
        autoReminder,
      });
      if (result.status === "saved") {
        setError(null);
        showSnackbar({ message: t("saved") });
      } else {
        setError(t(result.status));
      }
    });

  const remind = (userId?: string) =>
    startTransition(async () => {
      if (!view.plan) return;
      const result = await remindDutyAction(amapSlug, { planId: view.plan.id, userId });
      showSnackbar({
        message:
          result.status === "sent"
            ? t("reminded", { count: result.sent })
            : result.status === "not_open"
              ? t("notOpen")
              : t("forbidden"),
      });
    });

  const notice = !view.plan
    ? t("periodNotSaved")
    : view.plan.openingNoticeOn
      ? t("periodNoticeSent", { date: longDay(view.plan.openingNoticeOn) })
      : t("periodNoticePending", { date: longDay(view.opensOn) });

  return (
    <Stack spacing={3} sx={{ maxWidth: 1040 }}>
      <Paper
        component="section"
        aria-labelledby="periode-reponse"
        variant="outlined"
        sx={{ p: 2.5 }}
      >
        <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "flex-end", gap: 2 }}>
          <Box sx={{ flex: "1 1 220px" }}>
            <Typography id="periode-reponse" variant="titleMedium" component="h2">
              {t("periodTitle")}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary">
              {notice}
            </Typography>
          </Box>
          <TextField
            id="duty-opens-on"
            type="date"
            label={t("opensOn")}
            value={opensOn}
            onChange={(e) => setOpensOn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            id="duty-deadline-on"
            type="date"
            label={t("deadlineOn")}
            value={deadlineOn}
            onChange={(e) => setDeadlineOn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={autoReminder}
                onChange={(e) => setAutoReminder(e.target.checked)}
              />
            }
            label={t("autoReminder")}
          />
          <Button variant="contained" onClick={save} disabled={pending}>
            {t("save")}
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {view.plan && (
        <Paper
          component="section"
          aria-label={t("progress", { answered: answered.length, total })}
          elevation={0}
          sx={{
            p: 2.5,
            bgcolor: m3("surfaceContainer"),
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Stack spacing={0.75} sx={{ minWidth: 240 }}>
            <Typography>{t("progress", { answered: answered.length, total })}</Typography>
            <LinearProgress
              variant="determinate"
              value={total === 0 ? 0 : (answered.length / total) * 100}
              aria-hidden
            />
            <Typography variant="bodySmall" color="text.secondary">
              {view.plan.lastReminderOn
                ? t("lastReminder", { date: longDay(view.plan.lastReminderOn) })
                : t("noReminder")}{" "}
              {view.autoReminder
                ? t("autoPlanned", {
                    date: longDay(addDays(view.deadlineOn, -DUTY_REMINDER_DAYS)),
                  })
                : t("autoOff")}
            </Typography>
          </Stack>
          {open && (
            <Button
              variant="outlined"
              onClick={() => remind()}
              disabled={pending || missing.length === 0}
            >
              {t("remindAll", { count: missing.length })}
            </Button>
          )}
        </Paper>
      )}

      <ToggleButtonGroup
        exclusive
        size="small"
        value={filter}
        onChange={(_, value: Filter | null) => value && setFilter(value)}
        aria-label={t("filters")}
      >
        <ToggleButton value="all">{t("filterAll", { count: total })}</ToggleButton>
        <ToggleButton value="no">{t("filterNo", { count: missing.length })}</ToggleButton>
        <ToggleButton value="yes">{t("filterYes", { count: answered.length })}</ToggleButton>
      </ToggleButtonGroup>

      <TableContainer component={Paper} variant="outlined">
        <Table aria-label={t("tableLabel")}>
          <TableHead>
            <TableRow>
              <TableCell scope="col">{t("colPerson")}</TableCell>
              <TableCell scope="col">{t("colHousehold")}</TableCell>
              <TableCell scope="col">{t("colAnswer")}</TableCell>
              <TableCell scope="col">{t("colDates")}</TableCell>
              <TableCell scope="col">{t("colActions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const name = `${row.firstName} ${row.lastName}`.trim();
              return (
                <TableRow key={row.userId}>
                  <TableCell component="th" scope="row">
                    {name}
                  </TableCell>
                  <TableCell>{row.householdName}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={row.answeredOn ? "success" : "default"}
                      label={
                        row.answeredOn
                          ? t("answeredOn", { date: shortDay(row.answeredOn) })
                          : t("noAnswer")
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {row.answeredOn
                      ? row.dates.length > 0
                        ? row.dates.map(shortDay).join(", ")
                        : t("everywhere")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {!row.answeredOn && (
                      <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                        {open && (
                          <Button
                            size="small"
                            onClick={() => remind(row.userId)}
                            disabled={pending}
                            aria-label={t("remindOf", { name })}
                          >
                            {t("remind")}
                          </Button>
                        )}
                        {row.lastRemindedOn && (
                          <Typography variant="bodySmall" color="text.secondary">
                            {t("remindedOn", { date: shortDay(row.lastRemindedOn) })}
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="bodySmall" color="text.secondary">
        {t("footnote")}
      </Typography>
    </Stack>
  );
}
