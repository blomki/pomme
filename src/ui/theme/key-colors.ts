import type { AmapTheme } from "@/db/schema";

import { isHexColor, type KeyColors } from "./m3-colors";

/** Couleurs de la plateforme Pomme (accueil, espace producteur, gestion de la plateforme). */
export const PLATFORM_KEY_COLORS: KeyColors = {
  primary: "#4f7a28", // vert pomme
  secondary: "#8c4a2f", // brun
  tertiary: "#c9a227", // doré
};

/** Couleurs des deux AMAP du jeu de données fictif (src/db/seed/data.ts). */
export const AMAP_DEMO_KEY_COLORS: Record<string, KeyColors> = {
  hommesdeterre: { primary: "#e8722a", secondary: "#5b8c3a", tertiary: "#c9a227" },
  "pays-d-auge-demo": { primary: "#3f6fb5", secondary: "#7a5c99", tertiary: "#2e8b7a" },
};

/** Polices de titre proposées aux AMAP. Les fichiers sont dans ./fonts (voir fonts.ts). */
export const HEADING_FONTS = ["Carlito", "Pattaya"] as const;
export type HeadingFont = (typeof HEADING_FONTS)[number];

/** Réglages de thème prêts à l'emploi : toujours complets et valides. */
export type ThemeConfig = { keyColors: KeyColors; headingFont: HeadingFont };

export const PLATFORM_THEME: ThemeConfig = {
  keyColors: PLATFORM_KEY_COLORS,
  headingFont: "Carlito",
};

/**
 * Transforme le thème enregistré pour une AMAP (colonne amap.theme) en réglages complets.
 * Une couleur absente ou mal formée est remplacée par celle de la plateforme, une police
 * inconnue par Carlito : un réglage abîmé ne casse jamais l'affichage.
 */
export function resolveThemeConfig(theme: AmapTheme | null | undefined): ThemeConfig {
  const pick = (value: string | undefined, fallback: string) =>
    value && isHexColor(value) ? value : fallback;
  const optional = (value: string | undefined) => (value && isHexColor(value) ? value : undefined);
  const headingFont = HEADING_FONTS.find((font) => font === theme?.headingFont) ?? "Carlito";
  return {
    keyColors: {
      primary: pick(theme?.primary, PLATFORM_KEY_COLORS.primary),
      secondary: pick(theme?.secondary, PLATFORM_KEY_COLORS.secondary),
      tertiary: pick(theme?.tertiary, PLATFORM_KEY_COLORS.tertiary),
      ...(optional(theme?.neutral) && { neutral: optional(theme?.neutral) }),
      ...(optional(theme?.neutralVariant) && { neutralVariant: optional(theme?.neutralVariant) }),
    },
    headingFont,
  };
}
