"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatEuros } from "@/domain/catalog";
import { MAX_REPORT_COMMENT_LENGTH } from "@/domain/reports";
import { formatDate } from "@/i18n/dates";
import type { ReportView } from "@/server/reports";
import { rejectReportAction } from "@/server/reports-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { ReportStatusChip } from "./ReportStatusChip";

/**
 * Signalements à traiter puis traités (story F5), pour le référent (ses producteurs) et l'admin
 * (tous) : foyer, produit, distribution, quantité, motif, source. « Rejeter » demande un motif,
 * montré à la famille. L'avoir arrive avec F2.
 */
export function ReportsToTreat({ amapSlug, reports }: { amapSlug: string; reports: ReportView[] }) {
  const t = useTranslations("Reports.treat");
  const tf = useTranslations("Reports.form");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  const [rejecting, setRejecting] = useState<ReportView | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const open = reports.filter((r) => r.status === "open");
  const decided = reports.filter((r) => r.status !== "open");

  const reject = async () => {
    if (!rejecting || pending) return;
    if (note.trim() === "") return setError(t("noteRequired"));
    setPending(true);
    try {
      const result = await rejectReportAction(amapSlug, { reportId: rejecting.id, note });
      if (result.status !== "rejected") return setError(t(`refused.${result.status}`));
      showSnackbar({ message: t("rejected", { household: rejecting.householdName }) });
      setRejecting(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const table = (rows: ReportView[], withActions: boolean, labelledBy: string) => (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-labelledby={labelledBy}>
        <TableHead>
          <TableRow>
            <TableCell scope="col">{t("household")}</TableCell>
            <TableCell scope="col">{t("product")}</TableCell>
            <TableCell scope="col">{t("distribution")}</TableCell>
            <TableCell scope="col">{t("reason")}</TableCell>
            <TableCell scope="col">{t("statusCol")}</TableCell>
            {withActions && <TableCell scope="col">{t("actions")}</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell component="th" scope="row">
                {r.householdName}
                <Typography variant="bodySmall" sx={{ display: "block", color: "text.secondary" }}>
                  {t(`source.${r.source}`)}
                </Typography>
              </TableCell>
              <TableCell>
                {t("productLine", { product: r.productName, quantity: r.quantity })}
                <Typography variant="bodySmall" sx={{ display: "block", color: "text.secondary" }}>
                  {t("productDetail", {
                    producer: r.producerName,
                    value: formatEuros(r.quantity * r.unitPriceCents),
                  })}
                </Typography>
              </TableCell>
              <TableCell>{formatDate(`${r.distributionDate}T12:00:00Z`, "d MMMM")}</TableCell>
              <TableCell>
                {tf(`reasons.${r.reason}`)}
                {r.comment && (
                  <Typography
                    variant="bodySmall"
                    sx={{ display: "block", color: "text.secondary" }}
                  >
                    « {r.comment} »
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <ReportStatusChip status={r.status} />
                {r.decisionNote && (
                  <Typography
                    variant="bodySmall"
                    sx={{ display: "block", color: "text.secondary" }}
                  >
                    {r.decisionNote}
                  </Typography>
                )}
              </TableCell>
              {withActions && (
                <TableCell>
                  <Button
                    size="small"
                    onClick={() => {
                      setRejecting(r);
                      setNote("");
                      setError(null);
                    }}
                    aria-label={t("rejectOf", {
                      household: r.householdName,
                      product: r.productName,
                    })}
                  >
                    {t("reject")}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Stack spacing={4}>
      <Box component="section" aria-labelledby="signalements-a-traiter">
        <Typography id="signalements-a-traiter" variant="h2" sx={{ mb: 1 }}>
          {t("openTitle", { count: open.length })}
        </Typography>
        {open.length === 0 ? (
          <Typography sx={{ color: "text.secondary" }}>{t("noneOpen")}</Typography>
        ) : (
          <>
            <Typography sx={{ color: "text.secondary", mb: 1 }}>{t("creditSoon")}</Typography>
            {table(open, true, "signalements-a-traiter")}
          </>
        )}
      </Box>
      {decided.length > 0 && (
        <Box component="section" aria-labelledby="signalements-traites">
          <Typography id="signalements-traites" variant="h2" sx={{ mb: 1 }}>
            {t("decidedTitle")}
          </Typography>
          {table(decided, false, "signalements-traites")}
        </Box>
      )}

      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        aria-labelledby="rejet-titre"
      >
        <DialogTitle id="rejet-titre">
          {rejecting && t("rejectTitle", { household: rejecting.householdName })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {rejecting &&
              t("rejectIntro", { product: rejecting.productName, quantity: rejecting.quantity })}
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            id="motif-rejet"
            label={t("note")}
            helperText={t("noteHelp")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            fullWidth
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: MAX_REPORT_COMMENT_LENGTH } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejecting(null)}>{t("cancel")}</Button>
          <Button variant="contained" onClick={() => void reject()} disabled={pending}>
            {t("confirmReject")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
