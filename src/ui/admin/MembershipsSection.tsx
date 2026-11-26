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
import { useState } from "react";

import { formatEuros, priceInput } from "@/domain/catalog";
import type { MembershipInputError, MembershipState } from "@/domain/memberships";
import { formatDate } from "@/i18n/dates";
import type { MembershipView } from "@/server/memberships";
import { archiveMembershipAction, saveMembershipAction } from "@/server/memberships-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { MembershipStatusChip } from "./MembershipStatusChip";

const day = (d: string) => formatDate(`${d}T12:00:00Z`, "d MMMM yyyy");
const shortDay = (d: string) => formatDate(`${d}T12:00:00Z`, "dd/MM/yyyy");

/**
 * Section « Adhésion » de la fiche d'un foyer (story B1) : statut calculé, adhésions saisies,
 * ajout, modification et archivage. `proposal` : dates proposées pour une nouvelle adhésion
 * (un an, à la suite de la dernière).
 */
export function MembershipsSection({
  amapSlug,
  householdId,
  memberships,
  state,
  proposal,
  readOnly,
}: {
  amapSlug: string;
  householdId: string;
  memberships: MembershipView[];
  state: MembershipState;
  proposal: { startDate: string; endDate: string };
  readOnly: boolean;
}) {
  const t = useTranslations("Admin.memberships");
  const showSnackbar = useSnackbar();
  const [editing, setEditing] = useState<MembershipView | "new" | null>(null);

  const archive = async (m: MembershipView) => {
    const result = await archiveMembershipAction(amapSlug, { householdId, id: m.id });
    if (result.status !== "archived") {
      showSnackbar({ message: t(`errors.${result.status}`), severity: "error" });
      return;
    }
    showSnackbar({
      message: t("archived", { start: shortDay(m.startDate), end: shortDay(m.endDate) }),
      // Annuler : la même adhésion est saisie de nouveau.
      onUndo: async () => {
        const restored = await saveMembershipAction(amapSlug, {
          householdId,
          startDate: m.startDate,
          endDate: m.endDate,
          fee: m.feeCents === null ? "" : priceInput(m.feeCents),
          note: m.note,
        });
        showSnackbar(
          restored.status === "saved"
            ? { message: t("restored") }
            : { message: t("restoreFailed"), severity: "error" },
        );
      },
    });
  };

  return (
    <Box component="section" aria-labelledby="membership-title" sx={{ mt: 5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 1, flexWrap: "wrap" }}>
        <Typography id="membership-title" variant="h2">
          {t("title")}
        </Typography>
        <MembershipStatusChip status={state.status} />
      </Stack>
      <Typography sx={{ mb: 2 }}>
        {t(`summary.${state.status}`, { date: state.date ? day(state.date) : "" })}
      </Typography>

      {memberships.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t("empty")}
        </Typography>
      ) : (
        <TableContainer sx={{ overflowX: "auto", mb: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell scope="col">{t("period")}</TableCell>
                <TableCell scope="col">{t("fee")}</TableCell>
                <TableCell scope="col">{t("note")}</TableCell>
                {!readOnly && <TableCell scope="col">{t("actions")}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {memberships.map((m) => {
                const dates = { start: shortDay(m.startDate), end: shortDay(m.endDate) };
                return (
                  <TableRow key={m.id}>
                    <TableCell component="th" scope="row">
                      {t("fromTo", dates)}
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {m.feeCents === null ? t("noFee") : formatEuros(m.feeCents)}
                    </TableCell>
                    <TableCell>{m.note}</TableCell>
                    {!readOnly && (
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            onClick={() => setEditing(m)}
                            aria-label={t("editOf", dates)}
                          >
                            {t("edit")}
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            onClick={() => void archive(m)}
                            aria-label={t("archiveOf", dates)}
                          >
                            {t("archive")}
                          </Button>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!readOnly && (
        <Button variant="outlined" onClick={() => setEditing("new")}>
          {t("add")}
        </Button>
      )}

      {editing && (
        <MembershipDialog
          key={editing === "new" ? "new" : editing.id}
          amapSlug={amapSlug}
          householdId={householdId}
          membership={editing === "new" ? null : editing}
          proposal={proposal}
          onClose={() => setEditing(null)}
        />
      )}
    </Box>
  );
}

/** Fenêtre d'ajout ou de modification d'une adhésion. */
function MembershipDialog({
  amapSlug,
  householdId,
  membership,
  proposal,
  onClose,
}: {
  amapSlug: string;
  householdId: string;
  membership: MembershipView | null;
  proposal: { startDate: string; endDate: string };
  onClose: () => void;
}) {
  const t = useTranslations("Admin.memberships");
  const showSnackbar = useSnackbar();
  const [startDate, setStartDate] = useState(membership?.startDate ?? proposal.startDate);
  const [endDate, setEndDate] = useState(membership?.endDate ?? proposal.endDate);
  const [fee, setFee] = useState(
    membership?.feeCents == null ? "" : priceInput(membership.feeCents),
  );
  const [note, setNote] = useState(membership?.note ?? "");
  const [errors, setErrors] = useState<MembershipInputError[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Le bouton reste actif pendant l'enregistrement (il garde le focus) ; un deuxième envoi
    // est ignoré.
    if (pending) return;
    setPending(true);
    try {
      const result = await saveMembershipAction(amapSlug, {
        householdId,
        ...(membership ? { id: membership.id } : {}),
        startDate,
        endDate,
        fee,
        note,
      });
      if (result.status === "saved") {
        showSnackbar({
          message: t("saved", { start: shortDay(startDate), end: shortDay(endDate) }),
        });
        onClose();
        return;
      }
      setErrors(result.status === "invalid" ? result.errors : []);
      setProblem(result.status === "invalid" ? null : t(`errors.${result.status}`));
    } finally {
      setPending(false);
    }
  };

  const errorOf = (field: "startDate" | "endDate" | "fee") => {
    if (errors.includes(field)) return t(`errors.${field}`);
    if (field === "endDate" && errors.includes("end_before_start")) {
      return t("errors.end_before_start");
    }
    return undefined;
  };

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="membership-dialog-title"
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle id="membership-dialog-title">
          {membership ? t("dialogEdit") : t("dialogAdd")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("dialogIntro")}</DialogContentText>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {problem && <Alert severity="error">{problem}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                id="membership-start"
                label={t("startDate")}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                fullWidth
                error={Boolean(errorOf("startDate"))}
                helperText={errorOf("startDate")}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                id="membership-end"
                label={t("endDate")}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                fullWidth
                error={Boolean(errorOf("endDate"))}
                helperText={errorOf("endDate")}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            <TextField
              id="membership-fee"
              label={t("feeLabel")}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              error={Boolean(errorOf("fee"))}
              helperText={errorOf("fee") ?? t("feeHelp")}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
            />
            <TextField
              id="membership-note"
              label={t("noteLabel")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              helperText={t("noteHelp")}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
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
