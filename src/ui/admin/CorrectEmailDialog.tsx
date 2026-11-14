"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

import { correctMemberEmailAction, type CorrectEmailState } from "@/server/members-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

/**
 * « Corriger l'email » d'un membre qui n'a plus accès à son ancienne adresse (story A1).
 * La personne est déconnectée de tous ses appareils ; la correction est journalisée.
 */
export function CorrectEmailDialog({
  amapSlug,
  person,
  onClose,
}: {
  amapSlug: string;
  person: { userId: string; name: string; email: string };
  onClose: () => void;
}) {
  const t = useTranslations("Admin.correctEmail");
  const showSnackbar = useSnackbar();
  const [state, formAction, pending] = useActionState<CorrectEmailState, FormData>(
    correctMemberEmailAction,
    { status: "idle" },
  );
  const { name } = person;

  useEffect(() => {
    if (state.status === "corrected") {
      showSnackbar({ message: t("saved", { name }) });
      onClose();
    }
  }, [state.status, showSnackbar, t, name, onClose]);

  const fieldError =
    state.status === "invalid"
      ? t("invalid")
      : state.status === "same"
        ? t("same")
        : state.status === "taken"
          ? t("taken")
          : null;

  return (
    <Dialog open onClose={onClose} aria-labelledby="correct-email-title" fullWidth maxWidth="sm">
      <form action={formAction} noValidate>
        <DialogTitle id="correct-email-title">{t("dialogTitle", { name })}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("dialogIntro")}</DialogContentText>
          <input type="hidden" name="amap" value={amapSlug} />
          <input type="hidden" name="userId" value={person.userId} />
          <TextField
            name="email"
            type="email"
            label={t("newEmail")}
            defaultValue={person.email}
            autoComplete="off"
            required
            fullWidth
            error={fieldError !== null}
            helperText={fieldError ?? " "}
          />
          <div role="status" aria-live="polite">
            {state.status === "forbidden" && <Alert severity="error">{t("forbidden")}</Alert>}
          </div>
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
