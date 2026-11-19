"use client";

import ArrowBack from "@mui/icons-material/ArrowBack";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { ReportProblem } from "@/domain/reports";
import { formatDate } from "@/i18n/dates";
import type { ReportableLine, ReportView } from "@/server/reports";
import { createFamilyReportAction } from "@/server/reports-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { ReportFields, type ReportFieldValues } from "../reports/ReportFields";
import { ReportStatusChip } from "../reports/ReportStatusChip";
import { m3 } from "../theme/create-theme";

const day = (date: string) => formatDate(`${date}T12:00:00Z`, "EEEE d MMMM");

/**
 * « Signaler un problème » (story F5, écran 6) : la famille choisit un produit d'une
 * distribution passée, la quantité, le motif ; le référent du producteur décide ensuite (avoir
 * ou rejet). Dessous, ses signalements et leur suite.
 */
export function FamilyReports({
  amapSlug,
  lines,
  reports,
}: {
  amapSlug: string;
  lines: ReportableLine[];
  reports: ReportView[];
}) {
  const t = useTranslations("Reports.family");
  const tf = useTranslations("Reports.form");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  const [lineId, setLineId] = useState(lines[0]?.orderLineId ?? "");
  const [values, setValues] = useState<ReportFieldValues>({
    quantity: "1",
    reason: "missing",
    comment: "",
  });
  const [problems, setProblems] = useState<ReportProblem[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const line = lines.find((l) => l.orderLineId === lineId);

  const fail = (message: string) => {
    setProblem(message);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!line || pending) return;
    setPending(true);
    try {
      const result = await createFamilyReportAction(amapSlug, {
        orderLineId: line.orderLineId,
        quantity: Number(values.quantity),
        reason: values.reason,
        comment: values.comment,
      });
      if (result.status === "created") {
        setProblems([]);
        setProblem(null);
        setValues({ quantity: "1", reason: "missing", comment: "" });
        showSnackbar({ message: t("sent", { producer: line.producerName }) });
        router.refresh();
        return;
      }
      if (result.status === "invalid") {
        setProblems(result.problems);
        fail(tf("errors.summary"));
        return;
      }
      fail(t(`refused.${result.status}`));
    } catch {
      fail(tf("errors.network"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Button
          component={Link}
          href={`/${amapSlug}/famille`}
          nativeButton={false}
          startIcon={<ArrowBack />}
          sx={{ mb: 1, ml: -1 }}
        >
          {t("back")}
        </Button>
        <Typography variant="h1">{t("title")}</Typography>
        <Typography sx={{ color: "text.secondary" }}>{t("intro")}</Typography>
      </Box>

      {lines.length === 0 ? (
        <Alert severity="info">{t("nothingToReport")}</Alert>
      ) : (
        <Paper
          component="form"
          elevation={0}
          onSubmit={(e) => void submit(e)}
          noValidate
          aria-labelledby="nouveau-signalement"
          sx={{ p: 2, bgcolor: m3("surfaceContainer") }}
        >
          <Typography id="nouveau-signalement" variant="titleMedium" component="h2" sx={{ mb: 2 }}>
            {t("formTitle")}
          </Typography>
          <Box ref={summaryRef} tabIndex={-1} sx={{ mb: problem ? 2 : 0 }}>
            {problem && <Alert severity="error">{problem}</Alert>}
          </Box>
          <Stack spacing={2.5}>
            <TextField
              id="produit-signale"
              select
              label={t("product")}
              value={lineId}
              onChange={(e) => {
                setLineId(e.target.value);
                setValues((v) => ({ ...v, quantity: "1" }));
              }}
              helperText={t("productHelp")}
            >
              {lines.map((l) => (
                <MenuItem key={l.orderLineId} value={l.orderLineId}>
                  {t("lineOption", {
                    day: formatDate(`${l.distributionDate}T12:00:00Z`, "d MMM"),
                    product: l.productName,
                    producer: l.producerName,
                    quantity: l.reportable,
                  })}
                </MenuItem>
              ))}
            </TextField>
            <ReportFields
              values={values}
              onChange={setValues}
              max={line?.reportable ?? 1}
              problems={problems}
            />
            <Box>
              <Button type="submit" variant="contained" disabled={pending}>
                {t("send")}
              </Button>
            </Box>
          </Stack>
        </Paper>
      )}

      <Box component="section" aria-labelledby="mes-signalements">
        <Typography id="mes-signalements" variant="titleLarge" component="h2" sx={{ mb: 1 }}>
          {t("mine")}
        </Typography>
        {reports.length === 0 ? (
          <Typography sx={{ color: "text.secondary" }}>{t("none")}</Typography>
        ) : (
          <List disablePadding>
            {reports.map((r) => (
              <ListItem key={r.id} divider disableGutters sx={{ alignItems: "flex-start", gap: 2 }}>
                <ListItemText
                  primary={t("reportLine", {
                    product: r.productName,
                    quantity: r.quantity,
                    producer: r.producerName,
                  })}
                  secondary={
                    <>
                      {t("reportDetail", {
                        day: day(r.distributionDate),
                        reason: tf(`reasons.${r.reason}`),
                      })}
                      {r.status === "rejected" && r.decisionNote && (
                        <Box component="span" sx={{ display: "block" }}>
                          {t("rejectedBecause", { note: r.decisionNote })}
                        </Box>
                      )}
                    </>
                  }
                />
                <ReportStatusChip status={r.status} />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Stack>
  );
}
