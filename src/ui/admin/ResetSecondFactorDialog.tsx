"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { resetSecondFactorAction } from "@/server/members-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

/**
 * « Réinitialiser la deuxième vérification » d'un membre qui a perdu son téléphone ou sa
 * passkey (story S10). Jamais par email : un admin le fait, après avoir reconnu la personne.
 */
export function ResetSecondFactorDialog({
  amapSlug,
  person,
  onClose,
}: {
  amapSlug: string;
  person: { userId: string; name: string };
  onClose: () => void;
}) {
  const t = useTranslations("Admin.resetSecondFactor");
  const showSnackbar = useSnackbar();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { name } = person;

  const confirm = async () => {
    setPending(true);
    const result = await resetSecondFactorAction({ amap: amapSlug, userId: person.userId });
    setPending(false);
    if (result.status === "reset") {
      showSnackbar({ message: t("done", { name }) });
      onClose();
    } else {
      setError(result.status === "self" ? t("self") : t("forbidden"));
    }
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="reset-factor-title" fullWidth maxWidth="sm">
      <DialogTitle id="reset-factor-title">{t("dialogTitle", { name })}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("dialogIntro", { name })}</DialogContentText>
        <div role="status" aria-live="polite">
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button variant="contained" color="error" disabled={pending} onClick={() => void confirm()}>
          {t("confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
