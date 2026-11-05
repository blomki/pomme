import { describe, expect, it } from "vitest";

import { activeHref } from "./active-href";

const hrefs = ["/producteur", "/producteur/catalogue", "/producteur/paiements"];

describe("activeHref", () => {
  it("active le lien de la page exacte", () => {
    expect(activeHref("/producteur", hrefs)).toBe("/producteur");
  });

  it("préfère le lien le plus précis", () => {
    expect(activeHref("/producteur/catalogue/pommes", hrefs)).toBe("/producteur/catalogue");
  });

  it("ne confond pas deux adresses qui commencent pareil", () => {
    expect(activeHref("/producteur/catalogues", ["/producteur/catalogue"])).toBeNull();
  });

  it("ne renvoie rien hors de la navigation", () => {
    expect(activeHref("/plateforme", hrefs)).toBeNull();
  });
});
