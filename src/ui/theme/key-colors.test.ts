import { describe, expect, it } from "vitest";

import { buildSeedData } from "@/db/seed/data";

import { AMAP_DEMO_KEY_COLORS, PLATFORM_KEY_COLORS, resolveThemeConfig } from "./key-colors";

describe("resolveThemeConfig", () => {
  it("reprend les couleurs et la police de l'AMAP", () => {
    const config = resolveThemeConfig({
      primary: "#e8722a",
      secondary: "#5b8c3a",
      tertiary: "#c9a227",
      headingFont: "Pattaya",
    });
    expect(config).toEqual({
      keyColors: { primary: "#e8722a", secondary: "#5b8c3a", tertiary: "#c9a227" },
      headingFont: "Pattaya",
    });
  });

  it("complète un thème vide avec celui de la plateforme", () => {
    expect(resolveThemeConfig({})).toEqual({
      keyColors: PLATFORM_KEY_COLORS,
      headingFont: "Carlito",
    });
  });

  it("ignore une couleur mal formée et une police inconnue", () => {
    const config = resolveThemeConfig({ primary: "rouge", headingFont: "Comic Sans" });
    expect(config.keyColors.primary).toBe(PLATFORM_KEY_COLORS.primary);
    expect(config.headingFont).toBe("Carlito");
  });

  it("garde les neutres facultatifs seulement s'ils sont valables", () => {
    const config = resolveThemeConfig({ neutral: "#112233", neutralVariant: "faux" });
    expect(config.keyColors.neutral).toBe("#112233");
    expect(config.keyColors).not.toHaveProperty("neutralVariant");
  });
});

describe("AMAP_DEMO_KEY_COLORS", () => {
  it("correspond aux couleurs du jeu de données fictif", () => {
    for (const amap of buildSeedData().amaps) {
      expect(resolveThemeConfig(amap.theme).keyColors).toEqual(AMAP_DEMO_KEY_COLORS[amap.slug]);
    }
  });
});
