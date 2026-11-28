import { describe, expect, it } from "vitest";

import { contrastRatio, findContrastFailures } from "./contrast";
import { createM3Schemes, successColors, type KeyColors } from "./m3-colors";
import { AMAP_DEMO_KEY_COLORS, DEFAULT_AMAP_KEY_COLORS, PLATFORM_THEME } from "./key-colors";

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
  "défaut des AMAP": DEFAULT_AMAP_KEY_COLORS,
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

// Charte de la plateforme (fiche #123) : couleurs exactes imposées en clair, par-dessus les tons
// calculés. Mêmes exigences que pour les AMAP, plus le texte sur l'or et sur le vert de succès.
describe("charte de la plateforme", () => {
  const schemes = createM3Schemes(PLATFORM_THEME.keyColors);
  const light = { ...schemes.light, ...PLATFORM_THEME.lightOverrides };

  it("garde les couleurs de la charte en clair", () => {
    expect(light).toMatchObject({
      primary: "#0A2540",
      secondary: "#635BFF",
      tertiary: "#C7A84B",
      surface: "#F8FAFC",
      surfaceContainer: "#EFF6FF",
      onSurface: "#0A2540",
    });
  });

  it("tous les textes lisibles en clair et en sombre", () => {
    expect(findContrastFailures(light)).toEqual([]);
    expect(findContrastFailures(schemes.dark)).toEqual([]);
  });

  it("le texte sur le vert de succès est lisible en clair et en sombre", () => {
    const success = successColors(PLATFORM_THEME.success!);
    for (const mode of [success.light, success.dark]) {
      expect(contrastRatio(mode.main, mode.on)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
