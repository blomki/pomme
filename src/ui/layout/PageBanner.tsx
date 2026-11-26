"use client";

import LeafOutlined from "@mui/icons-material/EnergySavingsLeafOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { createContext, useContext, type ReactNode } from "react";

import { m3 } from "../theme/create-theme";

/**
 * Image par défaut des bandeaux d'un espace (le logo de l'AMAP), posée une fois par le gabarit
 * (`DesktopShell`) : les pages n'ont pas à la transmettre.
 */
export const BannerImageContext = createContext<string | null>(null);

/**
 * Bandeau d'en-tête de page (charte du 2026-11-26, stories H1 et S14) : titre h1 dans la police
 * des titres de l'AMAP, phrase d'explication, image de l'AMAP à droite (décorative). Fond en
 * dégradé de la couleur secondaire du thème, pour que chaque AMAP garde ses couleurs ; le texte
 * en `onSecondary` garde un contraste d'au moins 4,5:1, en clair comme en sombre (tons M3).
 */
export function PageBanner({
  title,
  children,
  imageUrl,
}: {
  title: string;
  /** Phrase d'explication sous le titre. */
  children?: ReactNode;
  /** Image propre à cet écran ; sinon celle de l'espace (logo de l'AMAP), s'il y en a une. */
  imageUrl?: string | null;
}) {
  const fallback = useContext(BannerImageContext);
  const image = imageUrl === undefined ? fallback : imageUrl;
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
        // Téléphone : image sous le texte, alignée en bas à droite ; ordinateur : à droite,
        // centrée verticalement.
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        gap: { xs: 2, sm: 3 },
        color: m3("onSecondary"),
        background: `linear-gradient(120deg, ${m3("secondary")} 0%, color-mix(in srgb, ${m3("secondary")} 88%, ${m3("onSecondary")}) 100%)`,
      }}
    >
      {/* Motif de feuille décoratif, discret, en bas à gauche. */}
      <LeafOutlined
        aria-hidden
        sx={{
          position: "absolute",
          left: -12,
          bottom: -18,
          fontSize: 96,
          opacity: 0.12,
          transform: "rotate(-20deg)",
          pointerEvents: "none",
        }}
      />
      <Box sx={{ position: "relative", flex: 1, minWidth: 0 }}>
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
      {image && (
        <Box
          component="img"
          src={image}
          alt=""
          aria-hidden
          sx={{
            position: "relative",
            alignSelf: { xs: "flex-end", sm: "center" },
            width: { xs: 72, sm: 96 },
            height: { xs: 72, sm: 96 },
            flexShrink: 0,
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
