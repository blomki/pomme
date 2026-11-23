"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { IMPORT_COLUMNS, IMPORT_KINDS, templateHeader, type ImportKind } from "@/domain/imports";
import { applyImportAction, previewImportAction } from "@/server/imports-actions";
import type { ImportLine, ImportProblem, ImportReport } from "@/server/imports";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";
import type { M3Role } from "../theme/m3-colors";

/**
 * Texte d'un fichier : UTF-8, ou à défaut Windows-1252, l'encodage qu'Excel utilise souvent
 * sous Windows pour « CSV (séparateur : point-virgule) ». Sans ce repli, les accents seraient
 * illisibles.
 */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const STATUS_TONE: Record<ImportLine["status"], [M3Role, M3Role]> = {
  create: ["secondaryContainer", "onSecondaryContainer"],
  update: ["tertiaryContainer", "onTertiaryContainer"],
  unchanged: ["surfaceContainerHighest", "onSurfaceVariant"],
  refused: ["errorContainer", "onErrorContainer"],
};

/**
 * Reprise des données depuis AmapJ (story K1) : type de données, modèle, fichier CSV, aperçu
 * ligne par ligne, puis import. Un nouvel import du même fichier ne crée pas de doublons.
 */
export function ImportData({ amapSlug }: { amapSlug: string }) {
  const t = useTranslations("Admin.import");
  const showSnackbar = useSnackbar();
  const fileId = useId();
  const [kind, setKind] = useState<ImportKind>("households");
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<ImportReport | { status: "forbidden" } | null>(null);
  const [imported, setImported] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setReport(null);
    setImported(false);
  };

  const preview = () =>
    startTransition(async () => {
      if (csv === null) return;
      setImported(false);
      setReport(await previewImportAction(amapSlug, { kind, csv }));
    });

  const apply = () =>
    startTransition(async () => {
      if (csv === null) return;
      const result = await applyImportAction(amapSlug, { kind, csv });
      setReport(result);
      if (result.status === "ready") {
        setImported(true);
        showSnackbar({
          message: t("done", { created: result.counts.create, updated: result.counts.update }),
        });
      }
    });

  const problem = (p: ImportProblem) => {
    switch (p.code) {
      case "required":
        return t("problem_required", { column: p.column });
      case "member_elsewhere":
        return t("problem_member_elsewhere", { household: p.household });
      case "producer_unknown":
        return t("problem_producer_unknown", { producer: p.producer });
      case "duplicate_in_file":
        return t("problem_duplicate_in_file");
      default:
        return t(`problem_${p.code}`, { value: p.value });
    }
  };

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${templateHeader(kind)}\n`)}`;
  const ready = report?.status === "ready" ? report : null;
  const toWrite = ready ? ready.counts.create + ready.counts.update : 0;

  return (
    <Stack spacing={3} sx={{ maxWidth: 1000 }}>
      <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
        <Typography component="legend" variant="titleMedium" sx={{ mb: 1 }}>
          {t("kindLegend")}
        </Typography>
        <RadioGroup
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ImportKind);
            reset();
          }}
        >
          {IMPORT_KINDS.map((k) => (
            <FormControlLabel
              key={k}
              value={k}
              control={<Radio />}
              label={
                <span>
                  {t(`kind_${k}`)}
                  <Typography component="span" variant="bodySmall" color="text.secondary">
                    {" "}
                    — {t(`kindHint_${k}`)}
                  </Typography>
                </span>
              }
            />
          ))}
        </RadioGroup>
      </Box>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="titleSmall" component="h2" sx={{ mb: 1 }}>
          {t("columnsTitle")}
        </Typography>
        <Typography variant="bodyMedium" sx={{ mb: 1 }}>
          {IMPORT_COLUMNS[kind]
            .map((c) => (c.required ? t("requiredColumn", { column: c.label }) : c.label))
            .join(" · ")}
        </Typography>
        <Typography variant="bodySmall" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
          {t("columnsHint")}
        </Typography>
        <MuiLink href={template} download={`modele-pomme-${kind}.csv`}>
          {t("template")}
        </MuiLink>
      </Paper>

      <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
        <Typography component="label" htmlFor={fileId} variant="titleSmall">
          {t("fileLabel")}
        </Typography>
        <input
          id={fileId}
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            reset();
            if (!file) {
              setCsv(null);
              return;
            }
            setFileName(file.name);
            setCsv(await readText(file));
          }}
        />
        <Button variant="contained" onClick={preview} disabled={pending || csv === null}>
          {t("preview")}
        </Button>
      </Stack>

      <div role="status" aria-live="polite">
        {report?.status === "missing_columns" && (
          <Alert severity="error">{t("missing", { columns: report.missing.join(", ") })}</Alert>
        )}
        {report?.status === "empty" && <Alert severity="error">{t("empty")}</Alert>}
        {report?.status === "invalid" && <Alert severity="error">{t("invalid")}</Alert>}
        {report?.status === "forbidden" && <Alert severity="error">{t("forbidden")}</Alert>}
        {ready && (
          <Alert severity={imported ? "success" : "info"}>
            {t(imported ? "summaryDone" : "summary", {
              file: fileName,
              ...ready.counts,
            })}
          </Alert>
        )}
      </div>

      {ready && (
        <>
          {ready.ignoredColumns.length > 0 && (
            <Typography variant="bodySmall" color="text.secondary">
              {t("ignored", { columns: ready.ignoredColumns.join(", ") })}
            </Typography>
          )}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={t("tableLabel")}>
              <TableHead>
                <TableRow>
                  <TableCell scope="col">{t("colLine")}</TableCell>
                  <TableCell scope="col">{t("colData")}</TableCell>
                  <TableCell scope="col">{t("colStatus")}</TableCell>
                  <TableCell scope="col">{t("colReason")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ready.lines.map((l) => (
                  <TableRow key={l.line}>
                    <TableCell>{l.line}</TableCell>
                    <TableCell component="th" scope="row">
                      {l.label || "—"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={t(`status_${l.status}`)}
                        sx={{
                          bgcolor: m3(STATUS_TONE[l.status][0]),
                          color: m3(STATUS_TONE[l.status][1]),
                        }}
                      />
                    </TableCell>
                    <TableCell>{l.problems.map(problem).join(" ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!imported && (
            <Button
              variant="contained"
              onClick={apply}
              disabled={pending || toWrite === 0}
              sx={{ alignSelf: "flex-start" }}
            >
              {t("apply", { count: toWrite })}
            </Button>
          )}
        </>
      )}
    </Stack>
  );
}
