"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useId, type ReactElement, type ReactNode } from "react";

import { m3 } from "../theme/create-theme";

/**
 * Confirmation d'un envoi ou d'une action importante (charte du 2026-11-26, story S14) : icône
 * ronde, titre, résumé, puis « Annuler » et l'action principale, alignés à droite. Le dialogue
 * est nommé par son titre ; une erreur s'affiche dans une zone lue par les lecteurs d'écran.
 */
export function ConfirmDialog({
  open,
  icon,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  pending = false,
  destructive = false,
  error,
}: {
  open: boolean;
  /** Icône décorative de l'action (envoi, réinitialisation…). */
  icon: ReactElement;
  title: string;
  /** Résumé de ce qui va se passer. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
  /** Action difficile à annuler : bouton et icône aux couleurs d'erreur. */
  destructive?: boolean;
  error?: string | null;
}) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={id} fullWidth maxWidth="sm">
      <Box
        aria-hidden
        sx={{
          mt: 3,
          mx: "auto",
          width: 48,
          height: 48,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: destructive ? m3("errorContainer") : m3("primaryContainer"),
          color: destructive ? m3("onErrorContainer") : m3("onPrimaryContainer"),
        }}
      >
        {icon}
      </Box>
      <DialogTitle id={id} sx={{ textAlign: "center" }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{children}</DialogContentText>
        <div role="status" aria-live="polite">
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </div>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>{cancelLabel}</Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          disabled={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
