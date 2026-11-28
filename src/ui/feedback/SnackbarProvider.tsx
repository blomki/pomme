"use client";

import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlined from "@mui/icons-material/ErrorOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { m3 } from "../theme/create-theme";

export type SnackbarMessage = {
  message: string;
  /** Si fourni, un bouton « Annuler » l'appelle (par exemple pour rétablir une valeur). */
  onUndo?: () => void;
  /** Icône d'état (charte S14) : réussite par défaut, puisqu'on confirme une action. */
  severity?: Severity;
  /** Reste affiché jusqu'à sa fermeture (consigne à suivre, comme « Lien envoyé »). */
  persist?: boolean;
};

type Severity = "success" | "info" | "warning" | "error";

const ICONS = {
  success: <CheckCircleOutlined fontSize="inherit" />,
  info: <InfoOutlined fontSize="inherit" />,
  warning: <WarningAmberOutlined fontSize="inherit" />,
  error: <ErrorOutlined fontSize="inherit" />,
};

type ShowSnackbar = (snackbar: SnackbarMessage) => void;

const SnackbarContext = createContext<ShowSnackbar | null>(null);

/**
 * Message en bas de l'écran (snackbar M3) : confirmation d'une action, avec « Annuler » quand
 * c'est possible, ou message d'information, d'avertissement ou d'erreur (fiche #123 : même
 * composant pour tous les messages de ce type, par exemple « Vous êtes déconnecté. »).
 *
 * Une `Alert` MUI dans un `Snackbar` : icône d'état, bouton de fermeture au clavier, et annonce
 * aux lecteurs d'écran, polie (`status`) pour une confirmation ou une information, immédiate
 * (`alert`) pour un avertissement ou une erreur. Couleurs de surface inversée M3 : lisibles en
 * clair comme en sombre, quel que soit le thème de l'AMAP.
 *
 * @example
 * const showSnackbar = useSnackbar();
 * showSnackbar({ message: "Chèque marqué comme reçu.", onUndo: () => unmark(id) });
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Snackbar");
  // Le dernier message reste en mémoire pendant l'animation de fermeture.
  const [current, setCurrent] = useState<(SnackbarMessage & { key: number }) | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback<ShowSnackbar>((snackbar) => {
    setCurrent({ ...snackbar, key: Date.now() });
    setOpen(true);
  }, []);
  const close = () => setOpen(false);

  return (
    <SnackbarContext.Provider value={show}>
      {children}
      <Snackbar
        key={current?.key}
        open={open && current !== null}
        autoHideDuration={current?.persist ? null : 6000}
        onClose={(_event, reason) => {
          if (reason !== "clickaway") close();
        }}
      >
        {current ? (
          <Alert
            variant="filled"
            severity={current.severity ?? "success"}
            role={
              current.severity === "error" || current.severity === "warning" ? "alert" : "status"
            }
            iconMapping={ICONS}
            sx={{
              width: "100%",
              alignItems: "center",
              bgcolor: m3("inverseSurface"),
              color: m3("inverseOnSurface"),
              "& .MuiAlert-icon": { color: "inherit", opacity: 1 },
            }}
            action={
              <>
                {current.onUndo && (
                  <Button
                    color="inherit"
                    onClick={() => {
                      // Fermer d'abord : l'annulation peut afficher son propre message, qui ne
                      // doit pas être effacé aussitôt.
                      const undo = current.onUndo;
                      close();
                      undo?.();
                    }}
                  >
                    {t("undo")}
                  </Button>
                )}
                <IconButton color="inherit" aria-label={t("close")} onClick={close}>
                  <CloseIcon />
                </IconButton>
              </>
            }
          >
            {current.message}
          </Alert>
        ) : (
          <span />
        )}
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): ShowSnackbar {
  const show = useContext(SnackbarContext);
  if (!show) throw new Error("useSnackbar doit être utilisé sous AppThemeProvider.");
  return show;
}
