"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { checkRow, isExperienced, loadSpread, type RowCheck } from "@/domain/duty-planning";
import { formatDate } from "@/i18n/dates";
import {
  generatePlanningAction,
  savePlanningAction,
  sendPlanningAction,
} from "@/server/duty-planning-actions";
import type { PlanningEditorView } from "@/server/duty-planning";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";
import type { M3Role } from "../theme/m3-colors";

import { PendingNotice } from "./PendingNotice";

const monthName = (month: string) => formatDate(`${month}-01T12:00:00Z`, "MMMM");
const dayLabel = (day: string) => formatDate(`${day}T12:00:00Z`, "EEEE d MMMM");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type Grid = Record<string, Array<string | null>>;

type Tone = "success" | "warning" | "error" | "neutral";

/**
 * Couleurs des pastilles : paires de rôles Material 3 (fond « container » et texte « on… »),
 * faites pour un contraste suffisant dans les deux modes (RGAA, critère 3.2).
 */
const toneSx = (tone: Tone) => {
  const [bg, fg] = {
    success: ["secondaryContainer", "onSecondaryContainer"],
    warning: ["tertiaryContainer", "onTertiaryContainer"],
    error: ["errorContainer", "onErrorContainer"],
    neutral: ["surfaceContainerHighest", "onSurfaceVariant"],
  }[tone] as [M3Role, M3Role];
  return { bgcolor: m3(bg), color: m3(fg) };
};

const gridOf = (view: PlanningEditorView): Grid =>
  Object.fromEntries(
    view.months.flatMap((m) => m.distributions.map((d) => [d.id, [...d.userIds]] as const)),
  );

/**
 * Éditeur du planning des permanences d'un trimestre (story G2, écran A3) : un onglet par mois,
 * une liste par place de bénévole, un contrôle par ligne, la répartition sur le trimestre.
 * Avant l'envoi : brouillon (regénérer, enregistrer, envoyer). Après : chaque changement
 * s'enregistre en prévenant ou non les personnes concernées.
 */
export function PlanningEditor({ amapSlug, view }: { amapSlug: string; view: PlanningEditorView }) {
  const t = useTranslations("Admin.dutyPlanning");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const saved = useMemo(() => gridOf(view), [view]);
  const [grid, setGrid] = useState<Grid>(saved);
  const firstOpen = view.months.findIndex((m) => !m.readOnly);
  const [tab, setTab] = useState(Math.max(firstOpen, 0));
  const [notify, setNotify] = useState(true);
  const plan = view.plan;
  const sent = plan?.status === "sent";

  const people = useMemo(
    () => new Map(view.people.map((p) => [p.userId, p] as const)),
    [view.people],
  );
  const counts = useMemo(() => {
    const result = new Map(view.people.map((p) => [p.userId, 0]));
    for (const ids of Object.values(grid))
      for (const id of ids) if (id) result.set(id, (result.get(id) ?? 0) + 1);
    return result;
  }, [grid, view.people]);
  const spread = loadSpread(counts);
  const changedRows = Object.keys(grid).filter(
    (id) => JSON.stringify(grid[id]) !== JSON.stringify(saved[id]),
  );
  const dirty = changedRows.length > 0;
  const month = view.months[tab];

  const setSlot = (distributionId: string, index: number, userId: string | null) =>
    setGrid((g) => ({
      ...g,
      [distributionId]: g[distributionId]!.map((v, i) => (i === index ? userId : v)),
    }));

  const rowsToSave = (all: boolean) =>
    (all ? Object.keys(grid) : changedRows)
      .filter((id) => !view.months.find((m) => m.distributions.some((d) => d.id === id))?.readOnly)
      .map((distributionId) => ({ distributionId, userIds: grid[distributionId]! }));

  const done = (message: string) => {
    showSnackbar({ message });
    router.refresh();
  };

  const generate = () =>
    startTransition(async () => {
      const result = await generatePlanningAction(amapSlug, view.quarter);
      if (result.status === "generated") done(t("generated"));
      else
        showSnackbar({
          message: result.status === "already_sent" ? t("alreadySent") : t("forbidden"),
        });
    });

  const save = (then?: "send") =>
    startTransition(async () => {
      if (!plan) return;
      const result = await savePlanningAction(amapSlug, {
        planId: plan.id,
        notify: sent && notify,
        rows: rowsToSave(!sent),
      });
      if (result.status !== "saved") {
        showSnackbar({
          message:
            result.status === "past"
              ? t("past")
              : result.status === "duplicate"
                ? t("duplicate")
                : t("error"),
        });
        return;
      }
      if (then === "send") {
        const outcome = await sendPlanningAction(amapSlug, plan.id);
        done(outcome.status === "sent" ? t("sent", { count: outcome.counts.sent }) : t("error"));
      } else if (!sent) done(t("draftSaved"));
      else done(notify ? t("savedNotified", { count: result.counts.sent }) : t("savedPending"));
    });

  const label = (check: RowCheck) => {
    const name = (id: string) => people.get(id)?.name ?? "";
    switch (check.kind) {
      case "unavailable":
      case "duplicate":
        return t(`check_${check.kind}`, { name: name(check.userId) });
      case "missing":
        return t("check_missing", { count: check.count });
      default:
        return t(`check_${check.kind}`);
    }
  };
  const tone = (check: RowCheck): Tone =>
    check.kind === "unavailable" || check.kind === "duplicate"
      ? "error"
      : check.kind === "no_experienced" || check.kind === "missing"
        ? "warning"
        : "success";

  if (view.months.length === 0) return <Alert severity="info">{t("noDistribution")}</Alert>;

  return (
    <Stack spacing={2.5}>
      {plan && plan.pending.length > 0 && (
        <PendingNotice
          amapSlug={amapSlug}
          planId={plan.id}
          names={plan.pending.map((id) => people.get(id)?.name ?? "").filter(Boolean)}
        />
      )}
      {plan && !sent && (
        <Alert severity="info">
          {plan.answersPhase === "closed"
            ? t("answersDone")
            : t("answersOpen", { date: dayLabel(plan.deadlineOn) })}
        </Alert>
      )}

      {!plan?.generated && !sent ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Typography>{t("notGenerated")}</Typography>
            <Button variant="contained" onClick={generate} disabled={pending}>
              {t("generate")}
            </Button>
          </Stack>
        </Paper>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={(_, value: number) => setTab(value)}
            aria-label={t("monthsLabel")}
            variant="scrollable"
          >
            {view.months.map((m) => (
              <Tab
                key={m.month}
                label={
                  m.readOnly
                    ? t("monthPast", { month: capitalize(monthName(m.month)) })
                    : t("monthTab", {
                        month: capitalize(monthName(m.month)),
                        count: m.distributions.length,
                      })
                }
              />
            ))}
          </Tabs>

          {month?.readOnly && (
            <Alert severity="info" role="status">
              {t("pastText", { month: capitalize(monthName(month.month)) })}
            </Alert>
          )}

          {month && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small" aria-label={t("tableLabel", { month: monthName(month.month) })}>
                <TableHead>
                  <TableRow>
                    <TableCell scope="col">{t("colDistribution")}</TableCell>
                    {Array.from({ length: view.perDistribution }, (_, i) => (
                      <TableCell scope="col" key={i}>
                        {t("colVolunteer", { n: i + 1 })}
                      </TableCell>
                    ))}
                    <TableCell scope="col">{t("colCheck")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {month.distributions.map((d) => {
                    const ids = grid[d.id]!;
                    const check = checkRow({
                      distributionId: d.id,
                      userIds: ids,
                      people,
                      perDistribution: view.perDistribution,
                      threshold: view.threshold,
                    });
                    return (
                      <TableRow key={d.id}>
                        <TableCell component="th" scope="row" sx={{ whiteSpace: "nowrap" }}>
                          {capitalize(dayLabel(d.date))}
                        </TableCell>
                        {ids.map((userId, i) => (
                          <TableCell key={i} sx={{ minWidth: 180 }}>
                            {month.readOnly ? (
                              (userId && people.get(userId)?.name) || "—"
                            ) : (
                              <Box
                                component="select"
                                aria-label={t("slotLabel", { date: dayLabel(d.date), n: i + 1 })}
                                value={userId ?? ""}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                  setSlot(d.id, i, e.target.value || null)
                                }
                                sx={{
                                  width: "100%",
                                  minHeight: 40,
                                  px: 1,
                                  borderRadius: 1,
                                  border: 1,
                                  borderColor: "divider",
                                  bgcolor: "background.paper",
                                  color: "text.primary",
                                  font: "inherit",
                                }}
                              >
                                <option value="">{t("empty")}</option>
                                {view.people.map((p) => (
                                  <option key={p.userId} value={p.userId}>
                                    {t("option", {
                                      name: p.name,
                                      count: counts.get(p.userId) ?? 0,
                                      isNew: String(!isExperienced(p.experience, view.threshold)),
                                    })}
                                  </option>
                                ))}
                              </Box>
                            )}
                          </TableCell>
                        ))}
                        <TableCell>
                          <Chip
                            size="small"
                            sx={toneSx(month.readOnly ? "neutral" : tone(check))}
                            label={month.readOnly ? t("check_past") : label(check)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Paper elevation={0} sx={{ p: 2, bgcolor: m3("surfaceContainer") }}>
            <Typography>
              {spread.min === spread.max
                ? t("equitySame", { count: spread.min })
                : t("equitySpread", {
                    average: spread.average.toLocaleString("fr-FR", { maximumFractionDigits: 1 }),
                    min: spread.min,
                    max: spread.max,
                  })}
            </Typography>
          </Paper>

          <Box component="section" aria-labelledby="repartition">
            <Typography id="repartition" variant="titleSmall" component="h2" sx={{ mb: 1 }}>
              {t("loadTitle")}{" "}
              <Typography component="span" variant="bodySmall" color="text.secondary">
                · {t("loadHint")}
              </Typography>
            </Typography>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
              {view.people.map((p) => {
                const level = spread.level(p.userId);
                return (
                  <Chip
                    key={p.userId}
                    size="small"
                    sx={toneSx(
                      level === "even" ? "success" : level === "over" ? "warning" : "neutral",
                    )}
                    label={`${p.name} ${counts.get(p.userId) ?? 0}${
                      isExperienced(p.experience, view.threshold) ? "" : ` · ${t("newTag")}`
                    }`}
                  />
                );
              })}
            </Stack>
            <Typography variant="bodySmall" color="text.secondary" component="p" sx={{ mt: 1 }}>
              {t("loadLegend", { threshold: view.threshold })}
            </Typography>
          </Box>

          {!sent && (
            <Stack direction="row" sx={{ justifyContent: "flex-end", flexWrap: "wrap", gap: 1.5 }}>
              <Button variant="outlined" onClick={generate} disabled={pending}>
                {t("regenerate")}
              </Button>
              <Button variant="outlined" onClick={() => save()} disabled={pending || !dirty}>
                {t("saveDraft")}
              </Button>
              <Button variant="contained" onClick={() => save("send")} disabled={pending}>
                {t("send")}
              </Button>
            </Stack>
          )}
          {sent && !dirty && plan?.sentOn && (
            <Alert severity="success">{t("sentText", { date: dayLabel(plan.sentOn) })}</Alert>
          )}
          {sent && dirty && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                bgcolor: m3("tertiaryContainer"),
                color: m3("onTertiaryContainer"),
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1.5,
              }}
            >
              <Typography role="status">{t("dirty")}</Typography>
              <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                <Button onClick={() => setGrid(saved)} disabled={pending} color="inherit">
                  {t("discard")}
                </Button>
                <FormControlLabel
                  control={
                    <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                  }
                  label={t("notify")}
                />
                <Button variant="contained" onClick={() => save()} disabled={pending}>
                  {t("save")}
                </Button>
              </Stack>
            </Paper>
          )}
        </>
      )}
      <Typography variant="bodySmall" color="text.secondary">
        {t("rules", { threshold: view.threshold })}
      </Typography>
    </Stack>
  );
}
