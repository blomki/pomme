import { describe, expect, it } from "vitest";

import { createAmapTheme } from "./create-theme";
import { PLATFORM_THEME } from "./key-colors";
import { createM3Schemes } from "./m3-colors";

describe("createAmapTheme", () => {
  const theme = createAmapTheme(PLATFORM_THEME);
  const schemes = createM3Schemes(PLATFORM_THEME.keyColors);

  it("place les rôles M3 dans les palettes claire et sombre", () => {
    expect(theme.colorSchemes.light?.palette.primary.main).toBe(schemes.light.primary);
    expect(theme.colorSchemes.dark?.palette.primary.main).toBe(schemes.dark.primary);
    expect(theme.colorSchemes.dark?.palette.background.default).toBe(schemes.dark.surface);
    expect(theme.colorSchemes.light?.palette.m3.surfaceContainer).toBe(
      schemes.light.surfaceContainer,
    );
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
