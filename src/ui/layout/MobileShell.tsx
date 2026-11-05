"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

import { ColorModeToggle } from "../theme/ColorModeToggle";

/**
 * Gabarit mobile (familles, producteurs, pages publiques) : barre du haut avec le nom de
 * l'AMAP dans sa police de titre, contenu sur une colonne, barre de navigation du bas facultative.
 */
export function MobileShell({
  title,
  bottomNavigation,
  children,
}: {
  title: string;
  bottomNavigation?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" component="header">
        <Toolbar sx={{ gap: 1, minHeight: 64 }}>
          <Typography component="p" variant="headlineSmall" noWrap sx={{ flex: 1 }}>
            {title}
          </Typography>
          <ColorModeToggle />
        </Toolbar>
      </AppBar>
      <Box
        component="main"
        id="contenu"
        tabIndex={-1}
        sx={{
          flex: 1,
          width: "100%",
          maxWidth: 640,
          mx: "auto",
          px: 2,
          pt: 3,
          // Laisse la place à la barre du bas, fixée en bas de l'écran.
          pb: bottomNavigation ? 13 : 3,
          outline: "none",
        }}
      >
        {children}
      </Box>
      {bottomNavigation}
    </Box>
  );
}
