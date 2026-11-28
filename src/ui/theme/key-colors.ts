import type { AmapTheme } from "@/db/schema";

import { isHexColor, type KeyColors, type M3Scheme } from "./m3-colors";

/**
 * Couleurs par défaut d'une AMAP (remplacent une couleur absente ou abîmée de son thème). Ce
 * sont les anciennes couleurs de la plateforme : la charte de la plateforme (fiche #123) ne
 * change pas les AMAP.
 */
export const DEFAULT_AMAP_KEY_COLORS: KeyColors = {
  primary: "#4f7a28", // vert pomme
  secondary: "#8c4a2f", // brun
  tertiary: "#c9a227", // doré
};

/**
 * Charte de la plateforme Pomme (fiche #123) : écrans d'avant le choix d'une AMAP (connexion,
 * « Mes espaces », compte, gestion de la plateforme, espace producteur).
 */
export const PLATFORM_KEY_COLORS: KeyColors = {
  primary: "#0A2540", // navy
  secondary: "#635BFF", // bleu
  tertiary: "#C7A84B", // or
};

/** Couleurs des deux AMAP du jeu de données fictif (src/db/seed/data.ts). */
export const AMAP_DEMO_KEY_COLORS: Record<string, KeyColors> = {
  hommesdeterre: { primary: "#e8722a", secondary: "#5b8c3a", tertiary: "#c9a227" },
  "pays-d-auge-demo": { primary: "#3f6fb5", secondary: "#7a5c99", tertiary: "#2e8b7a" },
};

/** Polices de titre proposées aux AMAP. Les fichiers sont dans ./fonts (voir fonts.ts). */
export const HEADING_FONTS = ["Carlito", "Pattaya"] as const;
export type HeadingFont = (typeof HEADING_FONTS)[number];
/** Polices de titre d'un thème : celles des AMAP, plus Source Sans, réservée à la plateforme. */
export type ThemeHeadingFont = HeadingFont | "Source Sans";

/** Réglages de thème prêts à l'emploi : toujours complets et valides. */
export type ThemeConfig = {
  keyColors: KeyColors;
  headingFont: ThemeHeadingFont;
  /** Couleur de succès (puces « Actif », confirmations) ; absente : celle de MUI. */
  success?: string;
  /**
   * Rôles M3 imposés par une charte, en mode clair, à la place des tons calculés. Le contraste
   * de chaque paire reste vérifié par les tests (contrast.ts). Le mode sombre est calculé.
   */
  lightOverrides?: Partial<M3Scheme>;
};

/**
 * Thème de la plateforme : même mécanique que les AMAP (palettes tonales M3 à partir des
 * couleurs clés), puis les couleurs exactes de la charte en clair. Contrastes (WCAG 2.2 AA) :
 * - navy et bleu portent un texte blanc (15,5:1 et 4,7:1) ;
 * - l'or est trop clair pour du blanc (2,3:1) : il porte le texte navy (6,8:1) ;
 * - le vert #0D9488 aussi (3,7:1 avec du blanc) : MUI utilise son ton 40, plus foncé, pour les
 *   textes sur fond de succès.
 */
export const PLATFORM_THEME: ThemeConfig = {
  keyColors: PLATFORM_KEY_COLORS,
  headingFont: "Source Sans",
  success: "#0D9488",
  lightOverrides: {
    primary: "#0A2540",
    secondary: "#635BFF",
    tertiary: "#C7A84B",
    onTertiary: "#0A2540",
    surface: "#F8FAFC", // fond principal
    surfaceContainer: "#EFF6FF", // fond secondaire (barre du haut)
    onSurface: "#0A2540", // texte principal
  },
};

/**
 * Transforme le thème enregistré pour une AMAP (colonne amap.theme) en réglages complets.
 * Une couleur absente ou mal formée est remplacée par la couleur par défaut des AMAP, une police
 * inconnue par Carlito : un réglage abîmé ne casse jamais l'affichage.
 */
export function resolveThemeConfig(
  theme: AmapTheme | null | undefined,
): ThemeConfig & { headingFont: HeadingFont } {
  const pick = (value: string | undefined, fallback: string) =>
    value && isHexColor(value) ? value : fallback;
  const optional = (value: string | undefined) => (value && isHexColor(value) ? value : undefined);
  const headingFont = HEADING_FONTS.find((font) => font === theme?.headingFont) ?? "Carlito";
  return {
    keyColors: {
      primary: pick(theme?.primary, DEFAULT_AMAP_KEY_COLORS.primary),
      secondary: pick(theme?.secondary, DEFAULT_AMAP_KEY_COLORS.secondary),
      tertiary: pick(theme?.tertiary, DEFAULT_AMAP_KEY_COLORS.tertiary),
      ...(optional(theme?.neutral) && { neutral: optional(theme?.neutral) }),
      ...(optional(theme?.neutralVariant) && { neutralVariant: optional(theme?.neutralVariant) }),
    },
    headingFont,
  };
}
