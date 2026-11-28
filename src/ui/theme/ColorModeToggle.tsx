"use client";

import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlined from "@mui/icons-material/SettingsBrightnessOutlined";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useColorScheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";

const MODES = [
  { value: "light", icon: <LightModeOutlined fontSize="small" /> },
  { value: "system", icon: <SettingsBrightnessOutlined fontSize="small" /> },
  { value: "dark", icon: <DarkModeOutlined fontSize="small" /> },
] as const;

/**
 * Choix de l'apparence : clair, système (comme l'appareil) ou sombre. Bouton segmenté de
 * Material Design 3 (`ToggleButtonGroup`), avec un libellé visible pour chaque option et pas
 * seulement une icône (fiche #127).
 *
 * Le choix est gardé par MUI dans le navigateur (localStorage) et appliqué aussitôt, sans
 * rechargement ; le script du gabarit racine l'applique avant l'affichage de chaque page, y
 * compris les pages sans connexion. Sans choix, l'apparence suit celle du système.
 *
 * `labelledBy` : identifiant du titre qui nomme le groupe (section « Affichage »).
 */
export function ColorModeToggle({ labelledBy }: { labelledBy?: string }) {
  const t = useTranslations("ColorMode");
  const { mode, setMode } = useColorScheme();
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      // Avant l'hydratation, le mode n'est pas encore connu : aucun bouton n'est coché.
      value={mode ?? null}
      onChange={(_event, value: (typeof MODES)[number]["value"] | null) => {
        if (value) setMode(value);
      }}
      {...(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": t("label") })}
    >
      {MODES.map(({ value, icon }) => (
        <ToggleButton key={value} value={value} sx={{ gap: 1, px: 2, textTransform: "none" }}>
          {icon}
          {t(value)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
