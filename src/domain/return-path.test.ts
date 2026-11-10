import { describe, expect, it } from "vitest";

import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("garde un chemin de Pomme", () => {
    expect(safeReturnPath("/hommesdeterre/admin")).toBe("/hommesdeterre/admin");
    expect(safeReturnPath("/plateforme?onglet=amap")).toBe("/plateforme?onglet=amap");
  });

  it("refuse une adresse qui mènerait vers un autre site", () => {
    expect(safeReturnPath("https://exemple.com")).toBe("/compte");
    expect(safeReturnPath("//exemple.com")).toBe("/compte");
    expect(safeReturnPath("/\\exemple.com")).toBe("/compte");
    expect(safeReturnPath("javascript:alert(1)")).toBe("/compte");
  });

  it("prend la valeur par défaut si rien n'est donné", () => {
    expect(safeReturnPath(undefined)).toBe("/compte");
    expect(safeReturnPath(null, "/plateforme")).toBe("/plateforme");
  });
});
