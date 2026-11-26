import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

import { m3 } from "../theme/create-theme";

/**
 * Bandeau d'en-tête de page (charte du 2026-11-26, stories H1 et S14) : titre dans la police des
 * titres de l'AMAP, phrase d'explication, image de l'AMAP à droite (décorative). Fond en dégradé
 * de la couleur secondaire du thème : chaque AMAP garde ses couleurs.
 */
export function PageBanner({
  title,
  children,
  imageUrl,
}: {
  title: string;
  /** Phrase d'explication sous le titre. */
  children?: ReactNode;
  /** Image de l'AMAP (logo, illustration) ; décorative, ignorée par les lecteurs d'écran. */
  imageUrl?: string | null;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "24px",
        px: { xs: 3, md: 4.5 },
        py: 3,
        mb: 3,
        display: "flex",
        alignItems: "center",
        gap: 3,
        color: m3("onSecondary"),
        // Dégradé discret : le texte garde un contraste suffisant sur toute la surface.
        background: `linear-gradient(120deg, ${m3("secondary")} 0%, color-mix(in srgb, ${m3("secondary")} 88%, ${m3("onSecondary")}) 100%)`,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: "1.875rem", md: "2.25rem" }, lineHeight: 1.2, mb: 1 }}
        >
          {title}
        </Typography>
        {children && (
          <Typography variant="bodyMedium" component="p" sx={{ maxWidth: 640 }}>
            {children}
          </Typography>
        )}
      </Box>
      {imageUrl && (
        <Box
          component="img"
          src={imageUrl}
          alt=""
          aria-hidden
          sx={{
            display: { xs: "none", sm: "block" },
            width: 96,
            height: 96,
            objectFit: "contain",
            borderRadius: "16px",
            bgcolor: m3("surface"),
            p: 1,
          }}
        />
      )}
    </Box>
  );
}
