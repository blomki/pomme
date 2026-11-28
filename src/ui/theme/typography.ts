import type { TypographyVariantsOptions } from "@mui/material/styles";

import type { ThemeHeadingFont } from "./key-colors";

/** Pile de polices du texte courant (variable posée par fonts.ts). */
export const BODY_FONT_FAMILY = "var(--font-carlito), Calibri, Arial, sans-serif";

/** Pile de polices des titres, selon le réglage de l'AMAP (ou Source Sans pour la plateforme). */
export function headingFontFamily(font: ThemeHeadingFont): string {
  if (font === "Pattaya") return "var(--font-pattaya), Georgia, serif";
  if (font === "Source Sans") return "var(--font-source-sans), Arial, sans-serif";
  return BODY_FONT_FAMILY;
}

/**
 * Graisse des titres : Pattaya n'existe qu'en graisse normale, Carlito garde la sienne ; Source
 * Sans est servie en semi-gras (charte de la plateforme).
 */
function headingWeightOf(font: ThemeHeadingFont): number {
  return font === "Source Sans" ? 600 : 400;
}

const rem = (px: number) => `${px / 16}rem`;

/** Style d'une variante, au format attendu par MUI. */
type VariantStyle = NonNullable<TypographyVariantsOptions["body1"]>;

function style(size: number, lineHeight: number, weight: number, tracking = 0): VariantStyle {
  return {
    fontSize: rem(size),
    lineHeight: `${lineHeight / size}`,
    fontWeight: weight,
    letterSpacing: tracking ? `${tracking / size}em` : 0,
  };
}

/**
 * Échelle typographique Material Design 3 (tailles en px converties en rem, pour suivre le
 * réglage de taille du navigateur). Les noms M3 (displayLarge…) sont ajoutés comme variantes
 * de Typography ; les variantes MUI habituelles (h1…, body1…) y sont rattachées.
 * Le texte courant fait au moins 16 px (bodyLarge) : Carlito est une police compacte.
 */
export function createM3Typography(headingFont: ThemeHeadingFont): TypographyVariantsOptions {
  const heading = { fontFamily: headingFontFamily(headingFont) };
  const headingWeight = headingWeightOf(headingFont);
  const scale = {
    displayLarge: { ...style(57, 64, headingWeight, -0.25), ...heading },
    displayMedium: { ...style(45, 52, headingWeight), ...heading },
    displaySmall: { ...style(36, 44, headingWeight), ...heading },
    headlineLarge: { ...style(32, 40, headingWeight), ...heading },
    headlineMedium: { ...style(28, 36, headingWeight), ...heading },
    headlineSmall: { ...style(24, 32, headingWeight), ...heading },
    titleLarge: style(22, 28, 700),
    titleMedium: style(16, 24, 700, 0.15),
    titleSmall: style(14, 20, 700, 0.1),
    bodyLarge: style(16, 24, 400, 0.5),
    bodyMedium: style(14, 20, 400, 0.25),
    bodySmall: style(12, 16, 400, 0.4),
    labelLarge: style(14, 20, 700, 0.1),
    labelMedium: style(12, 16, 700, 0.5),
    labelSmall: style(11, 16, 700, 0.5),
  };
  return {
    fontFamily: BODY_FONT_FAMILY,
    ...scale,
    h1: scale.headlineLarge,
    h2: scale.headlineMedium,
    h3: scale.headlineSmall,
    h4: scale.titleLarge,
    h5: scale.titleMedium,
    h6: scale.titleSmall,
    subtitle1: scale.titleMedium,
    subtitle2: scale.titleSmall,
    body1: scale.bodyLarge,
    body2: { ...scale.bodyMedium, fontSize: rem(15) },
    caption: scale.bodySmall,
    overline: { ...scale.labelSmall, textTransform: "uppercase" as const },
    button: { ...scale.labelLarge, textTransform: "none" as const },
  };
}

/** Noms des variantes typographiques M3 (utilisables dans <Typography variant=…>). */
export type M3TypographyVariant =
  | "displayLarge"
  | "displayMedium"
  | "displaySmall"
  | "headlineLarge"
  | "headlineMedium"
  | "headlineSmall"
  | "titleLarge"
  | "titleMedium"
  | "titleSmall"
  | "bodyLarge"
  | "bodyMedium"
  | "bodySmall"
  | "labelLarge"
  | "labelMedium"
  | "labelSmall";
