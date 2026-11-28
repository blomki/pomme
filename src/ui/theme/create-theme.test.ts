import type { Theme } from "@mui/material/styles";
import { describe, expect, it } from "vitest";

import { createAmapTheme } from "./create-theme";
import { PLATFORM_THEME } from "./key-colors";
import { createM3Schemes, successColors, type M3Scheme } from "./m3-colors";

/** Palettes claire et sombre, présentes à l'exécution mais absentes du type Theme de MUI. */
type ColorSchemes = Record<
  "light" | "dark",
  {
    palette: {
      primary: { main: string };
      success: { main: string };
      background: { default: string };
      text: { primary: string };
      m3: M3Scheme;
    };
  }
>;

describe("createAmapTheme", () => {
  const theme = createAmapTheme(PLATFORM_THEME);
  const { colorSchemes } = theme as unknown as { colorSchemes: ColorSchemes };
  const schemes = createM3Schemes(PLATFORM_THEME.keyColors);

  it("place les rôles M3 dans les palettes claire et sombre", () => {
    expect(colorSchemes.dark.palette.primary.main).toBe(schemes.dark.primary);
    expect(colorSchemes.dark.palette.background.default).toBe(schemes.dark.surface);
    expect(colorSchemes.light.palette.m3.surfaceDim).toBe(schemes.light.surfaceDim);
  });

  it("applique les couleurs imposées par la charte en clair (fiche #123)", () => {
    expect(colorSchemes.light.palette.primary.main).toBe("#0A2540");
    expect(colorSchemes.light.palette.background.default).toBe("#F8FAFC");
    expect(colorSchemes.light.palette.text.primary).toBe("#0A2540");
    expect(colorSchemes.light.palette.m3.surfaceContainer).toBe("#EFF6FF");
  });

  it("donne à la plateforme sa couleur de succès, et laisse celle de MUI aux AMAP", () => {
    const success = (t: Theme) =>
      (t as unknown as { colorSchemes: ColorSchemes }).colorSchemes.light.palette.success.main;
    expect(success(theme)).toBe(successColors("#0D9488").light.main);
    const amap = createAmapTheme({ keyColors: PLATFORM_THEME.keyColors, headingFont: "Carlito" });
    expect(success(amap)).not.toBe(success(theme));
  });

  it("utilise Source Sans pour les titres de la plateforme", () => {
    expect(theme.typography.headlineLarge.fontFamily).toContain("--font-source-sans");
    expect(theme.typography.headlineLarge.fontWeight).toBe(600);
    expect(theme.typography.fontFamily).toContain("--font-carlito");
  });

  it("expose les couleurs en variables CSS", () => {
    expect(theme.vars?.palette.primary.main).toMatch(/^var\(--mui-palette-primary-main/);
  });

  it("utilise la police de titre de l'AMAP", () => {
    const withPattaya = createAmapTheme({ ...PLATFORM_THEME, headingFont: "Pattaya" });
    expect(withPattaya.typography.headlineLarge.fontFamily).toContain("--font-pattaya");
    expect(withPattaya.typography.bodyLarge.fontFamily).toBeUndefined();
    expect(withPattaya.typography.fontFamily).toContain("--font-carlito");
  });
});
