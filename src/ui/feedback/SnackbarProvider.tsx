"use client";

import CloseIcon from "@mui/icons-material/Close";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type SnackbarMessage = {
  message: string;
  /** Si fourni, un bouton « Annuler » l'appelle (par exemple pour rétablir une valeur). */
  onUndo?: () => void;
};

type ShowSnackbar = (snackbar: SnackbarMessage) => void;

const SnackbarContext = createContext<ShowSnackbar | null>(null);

/**
 * Confirmation d'une action en bas de l'écran (snackbar M3), avec « Annuler » quand c'est
 * possible. Le message est lu par les lecteurs d'écran.
 *
 * @example
 * const showSnackbar = useSnackbar();
 * showSnackbar({ message: "Chèque marqué comme reçu.", onUndo: () => unmark(id) });
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Snackbar");
  const [current, setCurrent] = useState<(SnackbarMessage & { key: number }) | null>(null);
  const show = useCallback<ShowSnackbar>((snackbar) => {
    setCurrent({ ...snackbar, key: Date.now() });
  }, []);
  const close = () => setCurrent(null);

  return (
    <SnackbarContext.Provider value={show}>
      {children}
      <Snackbar
        key={current?.key}
        open={current !== null}
        autoHideDuration={6000}
        onClose={(_event, reason) => {
          if (reason !== "clickaway") close();
        }}
        message={current?.message}
        action={
          <>
            {current?.onUndo && (
              <Button
                color="inherit"
                onClick={() => {
                  current.onUndo?.();
                  close();
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
      />
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): ShowSnackbar {
  const show = useContext(SnackbarContext);
  if (!show) throw new Error("useSnackbar doit être utilisé sous AppThemeProvider.");
  return show;
}
