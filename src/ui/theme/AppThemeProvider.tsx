"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { useMemo, type ReactNode } from "react";

import { SnackbarProvider } from "../feedback/SnackbarProvider";

import { createAmapTheme } from "./create-theme";
import type { ThemeConfig } from "./key-colors";

/**
 * Applique le thème d'une AMAP (ou de la plateforme) à tout ce qu'il contient.
 *
 * Reçoit des réglages simples (couleurs, police) plutôt qu'un thème déjà construit : un thème
 * MUI contient des fonctions, qui ne peuvent pas passer du serveur au navigateur.
 * Le mode clair / sombre suit l'appareil par défaut ; le choix fait avec ColorModeToggle est
 * mémorisé dans le navigateur (il le sera dans le profil quand les comptes existeront, A3).
 */
export function AppThemeProvider({
  config,
  children,
}: {
  config: ThemeConfig;
  children: ReactNode;
}) {
  const theme = useMemo(() => createAmapTheme(config), [config]);
  return (
    <ThemeProvider theme={theme} defaultMode="system" disableTransitionOnChange>
      <CssBaseline enableColorScheme />
      <SnackbarProvider>{children}</SnackbarProvider>
    </ThemeProvider>
  );
}
