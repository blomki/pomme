/**
 * Système de couleurs Material Design 3, calculé à partir des couleurs clés d'une AMAP.
 *
 * Principe (comme le Material Theme Builder de Google) :
 * 1. chaque couleur clé donne une « palette tonale » : la même teinte déclinée du noir (ton 0)
 *    au blanc (ton 100), calculée dans l'espace de couleur HCT de Google ;
 * 2. chaque « rôle » (primary, onPrimary, surface…) prend un ton fixe de sa palette, différent
 *    en clair et en sombre.
 *
 * Comme les tons sont fixes, le contraste entre un rôle et son « on… » ne dépend pas de la
 * couleur choisie par l'AMAP : un jaune très clair donne, au ton 40, un jaune foncé lisible.
 */
// Copie locale de la bibliothèque de Google (voir vendor/material-color-utilities/README.md).
import { TonalPalette } from "./vendor/material-color-utilities/palettes/tonal_palette.js";
import { argbFromHex, hexFromArgb } from "./vendor/material-color-utilities/utils/string_utils.js";

/** Couleurs clés saisies par l'AMAP (comme dans le Material Theme Builder). */
export type KeyColors = {
  primary: string;
  secondary: string;
  tertiary: string;
  /** Facultatives : dérivées de la primaire (même teinte, très peu saturée) si absentes. */
  neutral?: string;
  neutralVariant?: string;
};

type PaletteName = "primary" | "secondary" | "tertiary" | "error" | "neutral" | "neutralVariant";

/** Rôle → [palette, ton en clair, ton en sombre]. Tons du schéma de référence M3. */
const ROLES = {
  primary: ["primary", 40, 80],
  onPrimary: ["primary", 100, 20],
  primaryContainer: ["primary", 90, 30],
  onPrimaryContainer: ["primary", 10, 90],
  inversePrimary: ["primary", 80, 40],
  secondary: ["secondary", 40, 80],
  onSecondary: ["secondary", 100, 20],
  secondaryContainer: ["secondary", 90, 30],
  onSecondaryContainer: ["secondary", 10, 90],
  tertiary: ["tertiary", 40, 80],
  onTertiary: ["tertiary", 100, 20],
  tertiaryContainer: ["tertiary", 90, 30],
  onTertiaryContainer: ["tertiary", 10, 90],
  error: ["error", 40, 80],
  onError: ["error", 100, 20],
  errorContainer: ["error", 90, 30],
  onErrorContainer: ["error", 10, 90],
  surface: ["neutral", 98, 6],
  onSurface: ["neutral", 10, 90],
  surfaceDim: ["neutral", 87, 6],
  surfaceBright: ["neutral", 98, 24],
  surfaceContainerLowest: ["neutral", 100, 4],
  surfaceContainerLow: ["neutral", 96, 10],
  surfaceContainer: ["neutral", 94, 12],
  surfaceContainerHigh: ["neutral", 92, 17],
  surfaceContainerHighest: ["neutral", 90, 22],
  surfaceVariant: ["neutralVariant", 90, 30],
  onSurfaceVariant: ["neutralVariant", 30, 80],
  inverseSurface: ["neutral", 20, 90],
  inverseOnSurface: ["neutral", 95, 20],
  outline: ["neutralVariant", 50, 60],
  outlineVariant: ["neutralVariant", 80, 30],
  scrim: ["neutral", 0, 0],
  shadow: ["neutral", 0, 0],
} as const satisfies Record<string, readonly [PaletteName, number, number]>;

export type M3Role = keyof typeof ROLES;
export type M3Scheme = Record<M3Role, string>;
export const M3_ROLES = Object.keys(ROLES) as M3Role[];

/** Rouge d'erreur M3 par défaut (teinte 25, chroma 84), identique pour toutes les AMAP. */
const ERROR_PALETTE = TonalPalette.fromHueAndChroma(25, 84);

/** Saturation des neutres dérivés de la primaire (valeurs du schéma « tonal spot » de M3). */
const NEUTRAL_CHROMA = 6;
const NEUTRAL_VARIANT_CHROMA = 8;

export function createPalettes(keys: KeyColors): Record<PaletteName, TonalPalette> {
  const primary = TonalPalette.fromInt(argbFromHex(keys.primary));
  return {
    primary,
    secondary: TonalPalette.fromInt(argbFromHex(keys.secondary)),
    tertiary: TonalPalette.fromInt(argbFromHex(keys.tertiary)),
    error: ERROR_PALETTE,
    neutral: keys.neutral
      ? TonalPalette.fromInt(argbFromHex(keys.neutral))
      : TonalPalette.fromHueAndChroma(primary.hue, NEUTRAL_CHROMA),
    neutralVariant: keys.neutralVariant
      ? TonalPalette.fromInt(argbFromHex(keys.neutralVariant))
      : TonalPalette.fromHueAndChroma(primary.hue, NEUTRAL_VARIANT_CHROMA),
  };
}

/** Calcule tous les rôles M3, en clair et en sombre, au format #rrggbb. */
export function createM3Schemes(keys: KeyColors): { light: M3Scheme; dark: M3Scheme } {
  const palettes = createPalettes(keys);
  const build = (mode: "light" | "dark") =>
    Object.fromEntries(
      Object.entries(ROLES).map(([role, [palette, lightTone, darkTone]]) => {
        const tone = mode === "light" ? lightTone : darkTone;
        return [role, hexFromArgb(palettes[palette].tone(tone))];
      }),
    ) as M3Scheme;
  return { light: build("light"), dark: build("dark") };
}

/** Vrai si la chaîne est une couleur #rrggbb (format attendu des couleurs clés). */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
