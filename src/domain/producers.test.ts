import { describe, expect, it } from "vitest";

import { canRevokeReferent, parseDistanceKm, producersWithoutReferent } from "./producers";

describe("producersWithoutReferent", () => {
  it("signale les producteurs actifs sans référent, par nom", () => {
    const list = [
      { name: "Œufs du Val", active: true, referentCount: 0 },
      { name: "Boulangerie", active: true, referentCount: 2 },
      { name: "Atelier fromager", active: true, referentCount: 0 },
      { name: "Cidrerie", active: false, referentCount: 0 },
    ];
    expect(producersWithoutReferent(list).map((p) => p.name)).toEqual([
      "Atelier fromager",
      "Œufs du Val",
    ]);
  });
});

describe("canRevokeReferent", () => {
  it("refuse tant que la personne suit des producteurs", () => {
    expect(canRevokeReferent(["Boulangerie"])).toBe(false);
  });

  it("accepte sinon", () => {
    expect(canRevokeReferent([])).toBe(true);
  });
});

describe("parseDistanceKm", () => {
  it.each([
    ["12", 12],
    [" 0 ", 0],
    ["1000", 1000],
    ["", null],
    ["  ", null],
  ])("lit « %s »", (input, expected) => {
    expect(parseDistanceKm(input)).toBe(expected);
  });

  it.each(["-3", "12,5", "abc", "1001", "99999"])("refuse « %s »", (input) => {
    expect(parseDistanceKm(input)).toBeUndefined();
  });
});
