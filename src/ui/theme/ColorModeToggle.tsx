"use client";

import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlined from "@mui/icons-material/SettingsBrightnessOutlined";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import { useColorScheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";

const MODES = [
  { value: "light", icon: <LightModeOutlined /> },
  { value: "system", icon: <SettingsBrightnessOutlined /> },
  { value: "dark", icon: <DarkModeOutlined /> },
] as const;

/** Choix du mode d'affichage : clair, automatique (comme l'appareil) ou sombre. */
export function ColorModeToggle() {
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
      aria-label={t("label")}
    >
      {MODES.map(({ value, icon }) => (
        <Tooltip key={value} title={t(value)}>
          <ToggleButton value={value} aria-label={t(value)}>
            {icon}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
