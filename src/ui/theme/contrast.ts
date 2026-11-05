/**
 * Contraste entre deux couleurs, selon la formule des WCAG 2.2 (critère 1.4.3).
 * 4,5:1 minimum pour le texte courant, 3:1 pour les grands textes et les éléments graphiques
 * (bordures de champs, icônes).
 */
import type { M3Role, M3Scheme } from "./m3-colors";

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative d'une couleur #rrggbb (0 = noir, 1 = blanc). */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste, de 1 (identiques) à 21 (noir sur blanc). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** Paires texte / fond utilisées par l'interface, avec le contraste minimal exigé. */
export const CONTRAST_PAIRS: ReadonlyArray<readonly [M3Role, M3Role, number]> = [
  ["onPrimary", "primary", 4.5],
  ["onPrimaryContainer", "primaryContainer", 4.5],
  ["onSecondary", "secondary", 4.5],
  ["onSecondaryContainer", "secondaryContainer", 4.5],
  ["onTertiary", "tertiary", 4.5],
  ["onTertiaryContainer", "tertiaryContainer", 4.5],
  ["onError", "error", 4.5],
  ["onErrorContainer", "errorContainer", 4.5],
  ["onSurface", "surface", 4.5],
  ["onSurface", "surfaceContainerLowest", 4.5],
  ["onSurface", "surfaceContainerLow", 4.5],
  ["onSurface", "surfaceContainer", 4.5],
  ["onSurface", "surfaceContainerHigh", 4.5],
  ["onSurface", "surfaceContainerHighest", 4.5],
  ["onSurfaceVariant", "surface", 4.5],
  ["onSurfaceVariant", "surfaceContainer", 4.5],
  ["onSurfaceVariant", "surfaceContainerHighest", 4.5],
  ["onSurfaceVariant", "surfaceVariant", 4.5],
  ["inverseOnSurface", "inverseSurface", 4.5],
  ["primary", "surface", 4.5], // liens et boutons texte
  ["primary", "surfaceContainerLow", 4.5],
  ["error", "surface", 4.5], // messages d'erreur
  ["outline", "surface", 3], // bordures des champs
];

export type ContrastFailure = {
  foreground: M3Role;
  background: M3Role;
  ratio: number;
  min: number;
};

/** Liste les paires dont le contraste est insuffisant (liste vide = schéma conforme). */
export function findContrastFailures(scheme: M3Scheme): ContrastFailure[] {
  return CONTRAST_PAIRS.flatMap(([foreground, background, min]) => {
    const ratio = contrastRatio(scheme[foreground], scheme[background]);
    return ratio < min ? [{ foreground, background, ratio, min }] : [];
  });
}
