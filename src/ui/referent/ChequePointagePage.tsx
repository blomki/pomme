"use client";

import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";

import { formatEuros, priceInput } from "@/domain/catalog";
import {
  chequeGap,
  hasOpenGap,
  matchesFilter,
  parseReceivedCents,
  pointageProgress,
  type ChequeFilter,
} from "@/domain/cheques";
import { addMonths } from "@/domain/distributions";
import { formatDate } from "@/i18n/dates";
import type { ChequePointage, PointageRow } from "@/server/cheques";
import {
  markChequeReceivedAction,
  settleChequeGapAction,
  unmarkChequeReceivedAction,
} from "@/server/cheques-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";
import { visuallyHidden } from "../visually-hidden";

/** Copie d'un objet sans une de ses clés (brouillon d'une ligne enregistrée). */
function without<T>(all: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...all };
  delete copy[key];
  return copy;
}

const numeric = { fontVariantNumeric: "tabular-nums", textAlign: "right" } as const;

/**
 * Écran « Pointage des chèques » du référent (story F1, écran R3) : mois (flèches), un onglet par
 * producteur suivi, avancement, filtres Tous / Non reçus / Écarts, puis une ligne par foyer.
 * Clavier : Espace coche « Reçu » (montant attendu prérempli), Entrée passe au foyer suivant.
 * Chaque changement est enregistré aussitôt ; le serveur le journalise.
 */
export function ChequePointagePage({
  amapSlug,
  producers,
  view,
}: {
  amapSlug: string;
  producers: Array<{ id: string; name: string }>;
  view: ChequePointage;
}) {
  const t = useTranslations("Referent.cheques");
  const showSnackbar = useSnackbar();
  const [rows, setRows] = useState<PointageRow[]>(view.cheques);
  const [filter, setFilter] = useState<ChequeFilter>("all");
  // Montants et numéros en cours de saisie, ligne par ligne (texte tel que tapé).
  const [drafts, setDrafts] = useState<Record<string, { amount?: string; number?: string }>>({});
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const checkboxes = useRef<Map<string, HTMLInputElement>>(new Map());

  const base = `/${amapSlug}/referent/cheques`;
  const href = (month: string, producer = view.amapProducerId) =>
    `${base}?mois=${month}&producteur=${producer}`;
  const monthLabel = formatDate(`${view.month}-01T12:00:00Z`, "MMMM yyyy");
  const progress = pointageProgress(rows);
  const shown = rows.filter((r) => matchesFilter(r, filter));
  const counts = {
    all: rows.length,
    pending: rows.filter((r) => matchesFilter(r, "pending")).length,
    gaps: rows.filter((r) => matchesFilter(r, "gaps")).length,
  };

  const replace = (row: PointageRow) =>
    setRows((all) => all.map((r) => (r.id === row.id ? row : r)));
  const refused = (status: string) => showSnackbar({ message: t(`refused.${status}`) });

  const mark = async (
    row: PointageRow,
    input: { receivedCents?: number; chequeNumber?: string },
  ) => {
    const result = await markChequeReceivedAction(amapSlug, { chequeId: row.id, ...input });
    if (result.status !== "saved") {
      refused(result.status);
      return null;
    }
    replace(result.cheque);
    setDrafts((all) => without(all, row.id));
    return result.cheque;
  };

  const unmark = async (row: PointageRow) => {
    const result = await unmarkChequeReceivedAction(amapSlug, row.id);
    if (result.status !== "saved") {
      refused(result.status);
      return null;
    }
    replace(result.cheque);
    setDrafts((all) => without(all, row.id));
    return result.cheque;
  };

  const toggle = async (row: PointageRow, received: boolean) => {
    if (received) {
      const saved = await mark(row, {});
      if (saved) {
        showSnackbar({
          message: t("receivedDone", {
            household: row.householdName,
            amount: formatEuros(saved.receivedCents ?? saved.expectedCents),
          }),
          onUndo: () => void unmark(saved),
        });
      }
      return;
    }
    const previous = {
      receivedCents: row.receivedCents ?? undefined,
      chequeNumber: row.chequeNumber ?? "",
    };
    const saved = await unmark(row);
    if (saved) {
      showSnackbar({
        message: t("unmarked", { household: row.householdName }),
        onUndo: () => void mark(saved, previous),
      });
    }
  };

  /** Enregistre le montant ou le numéro saisi, s'il a changé. */
  const commit = async (row: PointageRow) => {
    const draft = drafts[row.id];
    if (!draft || row.status !== "received") return true;
    const input: { receivedCents?: number; chequeNumber?: string } = {};
    if (draft.amount !== undefined) {
      const cents = parseReceivedCents(draft.amount);
      if (cents === null) {
        setInvalid((all) => ({ ...all, [row.id]: true }));
        return false;
      }
      if (cents !== row.receivedCents) input.receivedCents = cents;
    }
    if (draft.number !== undefined && draft.number.trim() !== (row.chequeNumber ?? "")) {
      input.chequeNumber = draft.number;
    }
    setInvalid((all) => without(all, row.id));
    if (Object.keys(input).length === 0) {
      setDrafts((all) => without(all, row.id));
      return true;
    }
    return (await mark(row, input)) !== null;
  };

  /** Entrée : enregistre la ligne, puis passe au foyer suivant (sa case « Reçu »). */
  const onRowKeyDown = async (event: React.KeyboardEvent, row: PointageRow) => {
    if (event.key !== "Enter" || (event.target as HTMLElement).tagName !== "INPUT") return;
    event.preventDefault();
    if (!(await commit(row))) return;
    const index = shown.findIndex((r) => r.id === row.id);
    const next = shown[index + 1];
    if (next) checkboxes.current.get(next.id)?.focus();
  };

  const settle = async (row: PointageRow, settled: boolean) => {
    const result = await settleChequeGapAction(amapSlug, { chequeId: row.id, settled });
    if (result.status !== "saved") return refused(result.status);
    replace(result.cheque);
    showSnackbar({
      message: t(settled ? "gapSettled" : "gapReopened", { household: row.householdName }),
      onUndo: settled ? () => void settle(result.cheque, false) : undefined,
    });
  };

  const notYet =
    view.periodStatus === null
      ? t("noPeriod")
      : view.periodStatus !== "closed" && rows.length === 0
        ? t("notClosed")
        : null;

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <Typography variant="h1" sx={{ flexGrow: 1 }}>
          {t("title", { month: monthLabel })}
        </Typography>
        <IconButton
          component={Link}
          nativeButton={false}
          href={href(addMonths(view.month, -1))}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          component={Link}
          nativeButton={false}
          href={href(addMonths(view.month, 1))}
          aria-label={t("nextMonth")}
        >
          <ChevronRight />
        </IconButton>
      </Stack>

      <Tabs
        value={view.amapProducerId}
        aria-label={t("tabs")}
        variant="scrollable"
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {producers.map((p) => (
          <Tab
            key={p.id}
            value={p.id}
            label={p.name}
            component={Link}
            href={href(view.month, p.id)}
          />
        ))}
      </Tabs>

      {notYet ? (
        <Typography>{notYet}</Typography>
      ) : rows.length === 0 ? (
        <Typography>{t("empty")}</Typography>
      ) : (
        <>
          <Box sx={{ mb: 3, maxWidth: 480 }}>
            <Typography id="avancement" role="status" sx={{ mb: 1 }}>
              {t("progress", { treated: progress.treated, total: progress.total })}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(progress.treated / progress.total) * 100}
              aria-labelledby="avancement"
            />
          </Box>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={filter}
            onChange={(_, value: ChequeFilter | null) => value && setFilter(value)}
            aria-label={t("filter")}
            sx={{ mb: 2, flexWrap: "wrap" }}
          >
            {(["all", "pending", "gaps"] as const).map((f) => (
              <ToggleButton key={f} value={f}>
                {t(`filters.${f}`, { count: counts[f] })}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Typography
            variant="bodyMedium"
            sx={{ color: "text.secondary", mb: 1 }}
            id="aide-clavier"
          >
            {t("keyboardHelp")}
          </Typography>

          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-describedby="aide-clavier">
              <TableHead>
                <TableRow>
                  <TableCell scope="col">{t("household")}</TableCell>
                  <TableCell scope="col" sx={numeric}>
                    {t("expected")}
                  </TableCell>
                  <TableCell scope="col">{t("received")}</TableCell>
                  <TableCell scope="col">{t("amount")}</TableCell>
                  <TableCell scope="col">{t("number")}</TableCell>
                  <TableCell scope="col">{t("gap")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>{t("noneInFilter")}</TableCell>
                  </TableRow>
                )}
                {shown.map((row) => {
                  const handedOver = row.status === "handed_over";
                  const received = row.status !== "expected";
                  const gap = chequeGap(row);
                  const draft = drafts[row.id] ?? {};
                  return (
                    <TableRow key={row.id} onKeyDown={(e) => void onRowKeyDown(e, row)}>
                      <TableCell component="th" scope="row">
                        {row.householdName}
                      </TableCell>
                      <TableCell sx={numeric}>
                        {formatEuros(row.expectedCents)}
                        {row.creditsCents > 0 && (
                          <Typography
                            variant="bodySmall"
                            sx={{ display: "block", color: "text.secondary" }}
                          >
                            {t("credit", { amount: formatEuros(row.creditsCents) })}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell padding="checkbox">
                        {handedOver ? (
                          <Typography variant="bodyMedium">{t("handedOver")}</Typography>
                        ) : (
                          <Checkbox
                            checked={received}
                            onChange={(e) => void toggle(row, e.target.checked)}
                            slotProps={{
                              input: {
                                ref: (el: HTMLInputElement | null) => {
                                  if (el) checkboxes.current.set(row.id, el);
                                  else checkboxes.current.delete(row.id);
                                },
                                "aria-label": t("receivedOf", { household: row.householdName }),
                              },
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <TextField
                          size="small"
                          value={
                            draft.amount ??
                            (row.receivedCents === null ? "" : priceInput(row.receivedCents))
                          }
                          disabled={!received || handedOver}
                          error={Boolean(invalid[row.id])}
                          onChange={(e) =>
                            setDrafts((all) => ({
                              ...all,
                              [row.id]: { ...all[row.id], amount: e.target.value },
                            }))
                          }
                          onBlur={() => void commit(row)}
                          slotProps={{
                            htmlInput: {
                              inputMode: "decimal",
                              "aria-label": t("amountOf", { household: row.householdName }),
                              "aria-invalid": Boolean(invalid[row.id]),
                              style: { textAlign: "right" },
                            },
                          }}
                          helperText={invalid[row.id] ? t("invalidAmount") : undefined}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 140 }}>
                        <TextField
                          size="small"
                          value={draft.number ?? row.chequeNumber ?? ""}
                          disabled={!received || handedOver}
                          onChange={(e) =>
                            setDrafts((all) => ({
                              ...all,
                              [row.id]: { ...all[row.id], number: e.target.value },
                            }))
                          }
                          onBlur={() => void commit(row)}
                          slotProps={{
                            htmlInput: {
                              maxLength: 30,
                              "aria-label": t("numberOf", { household: row.householdName }),
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {gap === null || gap === 0 ? (
                          <Typography variant="bodyMedium" sx={{ color: "text.secondary" }}>
                            {gap === 0 ? t("noGap") : "—"}
                          </Typography>
                        ) : (
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
                          >
                            <Chip
                              size="small"
                              label={t("gapAmount", {
                                amount: `${gap > 0 ? "+" : "−"} ${formatEuros(Math.abs(gap))}`,
                              })}
                              sx={
                                hasOpenGap(row)
                                  ? { bgcolor: m3("errorContainer"), color: m3("onErrorContainer") }
                                  : {
                                      bgcolor: m3("surfaceContainerHigh"),
                                      color: m3("onSurfaceVariant"),
                                    }
                              }
                            />
                            {!handedOver &&
                              (hasOpenGap(row) ? (
                                <Button size="small" onClick={() => void settle(row, true)}>
                                  {t("settle")}
                                  <Box component="span" sx={visuallyHidden}>
                                    {t("settleOf", { household: row.householdName })}
                                  </Box>
                                </Button>
                              ) : (
                                <Typography variant="bodySmall" sx={{ color: "text.secondary" }}>
                                  {t("settled")}
                                </Typography>
                              ))}
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </>
  );
}
