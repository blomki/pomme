import { describe, expect, it } from "vitest";

import { createM3Schemes, isHexColor, M3_ROLES } from "./m3-colors";

const keys = { primary: "#e8722a", secondary: "#5b8c3a", tertiary: "#c9a227" };

describe("createM3Schemes", () => {
  const { light, dark } = createM3Schemes(keys);

  it("calcule chaque rôle M3, en clair et en sombre", () => {
    for (const role of M3_ROLES) {
      expect(isHexColor(light[role]), `${role} (clair)`).toBe(true);
      expect(isHexColor(dark[role]), `${role} (sombre)`).toBe(true);
    }
  });

  it("garde des tons fixes : surfaces claires en clair, sombres en sombre", () => {
    expect(light.surfaceContainerLowest).toBe("#ffffff");
    expect(dark.scrim).toBe("#000000");
  });

  it("inverse primary et inversePrimary entre clair et sombre", () => {
    expect(light.inversePrimary).toBe(dark.primary);
    expect(dark.inversePrimary).toBe(light.primary);
  });

  it("utilise la même couleur d'erreur pour toutes les AMAP", () => {
    const other = createM3Schemes({
      primary: "#3f6fb5",
      secondary: "#7a5c99",
      tertiary: "#2e8b7a",
    });
    expect(other.light.error).toBe(light.error);
  });

  it("dérive les neutres de la primaire s'ils ne sont pas saisis", () => {
    const withNeutral = createM3Schemes({ ...keys, neutral: "#336699" });
    expect(withNeutral.light.surface).not.toBe(light.surface);
    expect(withNeutral.light.primary).toBe(light.primary);
  });

  it("est stable : mêmes couleurs clés, même schéma", () => {
    expect(createM3Schemes(keys)).toEqual(createM3Schemes(keys));
  });
});

describe("isHexColor", () => {
  it.each(["#e8722a", "#FFFFFF"])("accepte %s", (value) => {
    expect(isHexColor(value)).toBe(true);
  });
  it.each(["e8722a", "#fff", "red", "#gggggg"])("refuse %s", (value) => {
    expect(isHexColor(value)).toBe(false);
  });
});
