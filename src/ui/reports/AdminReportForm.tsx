"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { ReportProblem } from "@/domain/reports";
import { formatDate } from "@/i18n/dates";
import type { AdminReportForm as FormData } from "@/server/reports";
import { createAdminReportAction } from "@/server/reports-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { ReportFields, type ReportFieldValues } from "./ReportFields";

/**
 * L'admin reporte un écart de la feuille d'émargement (story F5, écran A5) : distribution, foyer,
 * produit commandé, puis quantité et motif. Changer de distribution recharge la page (adresse
 * ?distribution=…) pour lister ses foyers.
 */
export function AdminReportForm({
  amapSlug,
  form,
  distributionId,
}: {
  amapSlug: string;
  form: FormData;
  distributionId: string | null;
}) {
  const t = useTranslations("Reports.admin");
  const tf = useTranslations("Reports.form");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  const [householdId, setHouseholdId] = useState(form.households[0]?.id ?? "");
  const household = form.households.find((h) => h.id === householdId);
  const [lineId, setLineId] = useState(household?.lines[0]?.orderLineId ?? "");
  const line = household?.lines.find((l) => l.orderLineId === lineId);
  const [values, setValues] = useState<ReportFieldValues>({
    quantity: "1",
    reason: "missing",
    comment: "",
  });
  const [problems, setProblems] = useState<ReportProblem[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fail = (message: string) => {
    setProblem(message);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!line || !household || pending) return;
    setPending(true);
    try {
      const result = await createAdminReportAction(amapSlug, {
        orderLineId: line.orderLineId,
        quantity: Number(values.quantity),
        reason: values.reason,
        comment: values.comment,
      });
      if (result.status === "created") {
        setProblems([]);
        setProblem(null);
        setValues({ quantity: "1", reason: "missing", comment: "" });
        showSnackbar({ message: t("created", { household: household.name }) });
        router.refresh();
        return;
      }
      if (result.status === "invalid") {
        setProblems(result.problems);
        return fail(tf("errors.summary"));
      }
      fail(t(`refused.${result.status}`));
    } catch {
      fail(tf("errors.network"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="ecart-emargement"
      sx={{ p: 3, maxWidth: 720 }}
    >
      <Typography id="ecart-emargement" variant="h2" sx={{ mb: 1 }}>
        {t("title")}
      </Typography>
      <Typography sx={{ color: "text.secondary", mb: 2 }}>{t("intro")}</Typography>
      <Stack spacing={2.5}>
        <TextField
          id="distribution-emargement"
          select
          label={t("distribution")}
          value={distributionId ?? ""}
          onChange={(e) =>
            router.push(`/${amapSlug}/admin/signalements?distribution=${e.target.value}`)
          }
        >
          {form.distributions.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {formatDate(`${d.date}T12:00:00Z`, "EEEE d MMMM yyyy")}
            </MenuItem>
          ))}
        </TextField>

        {distributionId && form.households.length === 0 && (
          <Typography sx={{ color: "text.secondary" }}>{t("noOrders")}</Typography>
        )}

        {household && (
          <Box component="form" onSubmit={(e) => void submit(e)} noValidate>
            <Box ref={summaryRef} tabIndex={-1} sx={{ mb: problem ? 2 : 0 }}>
              {problem && <Alert severity="error">{problem}</Alert>}
            </Box>
            <Stack spacing={2.5}>
              <TextField
                id="foyer-emargement"
                select
                label={t("household")}
                value={householdId}
                onChange={(e) => {
                  const next = form.households.find((h) => h.id === e.target.value);
                  setHouseholdId(e.target.value);
                  setLineId(next?.lines[0]?.orderLineId ?? "");
                }}
              >
                {form.households.map((h) => (
                  <MenuItem key={h.id} value={h.id}>
                    {h.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                id="produit-emargement"
                select
                label={t("product")}
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
              >
                {household.lines.map((l) => (
                  <MenuItem key={l.orderLineId} value={l.orderLineId}>
                    {t("lineOption", {
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
                  {t("submit")}
                </Button>
              </Box>
            </Stack>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
