import { describe, expect, it } from "vitest";

import { contrastRatio, findContrastFailures } from "./contrast";
import { createM3Schemes, type KeyColors } from "./m3-colors";
import { AMAP_DEMO_KEY_COLORS, PLATFORM_KEY_COLORS } from "./key-colors";

describe("contrastRatio", () => {
  it("vaut 21 entre le noir et le blanc", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("vaut 1 entre deux couleurs identiques", () => {
    expect(contrastRatio("#e8722a", "#e8722a")).toBe(1);
  });

  it("ne dépend pas de l'ordre", () => {
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#777777"));
  });
});

// Contraste vérifié automatiquement pour chaque thème : les thèmes réels (plateforme, AMAP de
// démonstration) et des couleurs clés extrêmes qu'une AMAP pourrait choisir.
const themes: Record<string, KeyColors> = {
  plateforme: PLATFORM_KEY_COLORS,
  ...AMAP_DEMO_KEY_COLORS,
  "jaune très clair": { primary: "#ffff66", secondary: "#fff7c2", tertiary: "#ccffcc" },
  "noir et blanc": { primary: "#000000", secondary: "#ffffff", tertiary: "#808080" },
  "couleurs vives": { primary: "#ff00ff", secondary: "#00ffff", tertiary: "#00ff00" },
  "neutres saisis": {
    primary: "#1565c0",
    secondary: "#6a1b9a",
    tertiary: "#2e7d32",
    neutral: "#ffeedd",
    neutralVariant: "#223344",
  },
};

describe("findContrastFailures", () => {
  for (const [name, keys] of Object.entries(themes)) {
    const schemes = createM3Schemes(keys);
    it(`thème « ${name} » : tous les textes lisibles en clair`, () => {
      expect(findContrastFailures(schemes.light)).toEqual([]);
    });
    it(`thème « ${name} » : tous les textes lisibles en sombre`, () => {
      expect(findContrastFailures(schemes.dark)).toEqual([]);
    });
  }
});
