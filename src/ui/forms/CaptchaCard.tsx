"use client";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import type { ReactNode } from "react";

import { CAPTCHA_BACKGROUND, CAPTCHA_WIDTH } from "./Captcha";

/**
 * Carte d'un formulaire qui affiche le widget Friendly Captcha (connexion, fiche #123) :
 * - son contenu a la largeur du widget, ni plus ni moins (marges intérieures en plus) ;
 * - son fond est exactement celui du widget, en clair comme en sombre, pour qu'il s'y fonde.
 * Sur un écran étroit, la carte prend la largeur disponible et le widget se resserre.
 */
export function CaptchaCard({ children }: { children: ReactNode }) {
  return (
    <Card
      variant="outlined"
      sx={(theme) => ({
        width: "100%",
        // Largeur du widget plus les marges intérieures (16 px sur téléphone, 24 px au-delà).
        maxWidth: {
          xs: `calc(${CAPTCHA_WIDTH}px + 2 * ${theme.spacing(2)})`,
          sm: `calc(${CAPTCHA_WIDTH}px + 2 * ${theme.spacing(3)})`,
        },
        mx: "auto",
        backgroundColor: CAPTCHA_BACKGROUND.light,
        ...theme.applyStyles("dark", { backgroundColor: CAPTCHA_BACKGROUND.dark }),
      })}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 }, "&:last-child": { pb: { xs: 2, sm: 3 } } }}>
        {children}
      </CardContent>
    </Card>
  );
}
