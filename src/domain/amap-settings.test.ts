import { describe, expect, it } from "vitest";

import { checkAmapSettings, effectiveParameters, type AmapSettingsInput } from "./amap-settings";

const valid: AmapSettingsInput = {
  name: "AMAP des Vergers",
  colors: { primary: "#4f7a28", secondary: "#8c4a2f", tertiary: "#c9a227" },
  parameters: {
    volunteersPerDistribution: 3,
    experiencedThreshold: 6,
    membershipExpiryAlertDays: 30,
  },
};

describe("checkAmapSettings", () => {
  it("accepte des réglages complets", () => {
    expect(checkAmapSettings(valid)).toEqual([]);
  });

  it("refuse un nom vide ou trop long, une couleur mal formée", () => {
    expect(
      checkAmapSettings({ ...valid, name: " ", colors: { ...valid.colors, tertiary: "doré" } }),
    ).toEqual([
      { field: "name", problem: "required" },
      { field: "tertiary", problem: "color" },
    ]);
    expect(checkAmapSettings({ ...valid, name: "x".repeat(81) })).toEqual([
      { field: "name", problem: "too_long" },
    ]);
  });

  it("refuse un paramètre hors de ses bornes ou non entier", () => {
    expect(
      checkAmapSettings({
        ...valid,
        parameters: {
          volunteersPerDistribution: 0,
          experiencedThreshold: 2.5,
          membershipExpiryAlertDays: 181,
        },
      }),
    ).toEqual([
      { field: "volunteersPerDistribution", problem: "range" },
      { field: "experiencedThreshold", problem: "range" },
      { field: "membershipExpiryAlertDays", problem: "range" },
    ]);
  });
});

describe("effectiveParameters", () => {
  it("complète les paramètres absents par les valeurs par défaut", () => {
    expect(effectiveParameters({ experiencedThreshold: 4 })).toEqual({
      volunteersPerDistribution: 3,
      experiencedThreshold: 4,
      membershipExpiryAlertDays: 30,
    });
    expect(effectiveParameters(null)).toEqual({
      volunteersPerDistribution: 3,
      experiencedThreshold: 6,
      membershipExpiryAlertDays: 30,
    });
  });
});
