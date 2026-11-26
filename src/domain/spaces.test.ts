import { describe, expect, it } from "vitest";

import {
  landingPath,
  modeChoices,
  parsePreferredSpace,
  preferredSpaceValue,
  sortSpaces,
  spacePath,
  type AmapSpace,
} from "./spaces";

const referent: AmapSpace = { amapSlug: "hommesdeterre", amapName: "Cambremer", kind: "referent" };
const famille: AmapSpace = { amapSlug: "hommesdeterre", amapName: "Cambremer", kind: "famille" };
const admin: AmapSpace = { amapSlug: "pays-d-auge", amapName: "Auge", kind: "admin" };

describe("spacePath", () => {
  it("construit l'adresse de l'espace", () => {
    expect(spacePath(referent)).toBe("/hommesdeterre/referent");
  });
});

const none = { isPlatformAdmin: false, isProducer: false };
const platform = { isPlatformAdmin: true, isProducer: false };
const producer = { isPlatformAdmin: false, isProducer: true };

describe("landingPath", () => {
  it("envoie le producteur sans autre espace dans l'espace producteur", () => {
    expect(landingPath([], producer)).toBe("/producteur");
  });

  it("envoie vers « Mon compte » un producteur qui a aussi un foyer", () => {
    expect(landingPath([famille], producer)).toBe("/compte");
  });

  it("envoie directement dans l'unique espace", () => {
    expect(landingPath([famille], none)).toBe("/hommesdeterre/famille");
  });

  it("dans une seule AMAP, préfère l'espace de référent à celui de la famille", () => {
    expect(landingPath([famille, referent], none)).toBe("/hommesdeterre/referent");
  });

  it("préfère l'administration à tout le reste", () => {
    const adminHere: AmapSpace = { ...referent, kind: "admin" };
    expect(landingPath([famille, referent, adminHere], none)).toBe("/hommesdeterre/admin");
  });

  it("envoie le gestionnaire sans autre espace vers la plateforme", () => {
    expect(landingPath([], platform)).toBe("/plateforme");
  });

  it("envoie vers « Mon compte » quand les espaces sont dans plusieurs AMAP", () => {
    expect(landingPath([referent, admin], none)).toBe("/compte");
  });

  it("envoie vers « Mon compte » le gestionnaire qui a aussi un espace d'AMAP", () => {
    expect(landingPath([famille], platform)).toBe("/compte");
  });

  it("envoie vers « Mon compte » un compte sans espace", () => {
    expect(landingPath([], none)).toBe("/compte");
  });
});

describe("sortSpaces", () => {
  it("trie par AMAP, puis administration, référent, famille", () => {
    expect(sortSpaces([famille, referent, admin])).toEqual([admin, referent, famille]);
  });
});

describe("mode choisi dans « Mon profil » (A3)", () => {
  const spaces = [
    { amapSlug: "hommesdeterre", amapName: "Hommes de Terre", kind: "admin" as const },
    { amapSlug: "hommesdeterre", amapName: "Hommes de Terre", kind: "famille" as const },
    { amapSlug: "autre", amapName: "Autre", kind: "famille" as const },
  ];
  const none = { isPlatformAdmin: false, isProducer: false };

  it("ouvre l'espace choisi s'il est toujours un espace du compte", () => {
    expect(landingPath(spaces, none, "hommesdeterre/famille")).toBe("/hommesdeterre/famille");
    // Plus référent : le choix est ignoré.
    expect(landingPath(spaces, none, "hommesdeterre/referent")).toBe("/compte");
    expect(landingPath(spaces, none, "n'importe quoi")).toBe("/compte");
  });

  it("lit et écrit la valeur mémorisée", () => {
    expect(parsePreferredSpace("hommesdeterre/referent")).toEqual({
      amapSlug: "hommesdeterre",
      kind: "referent",
    });
    expect(parsePreferredSpace("hommesdeterre/plateforme")).toBeNull();
    expect(parsePreferredSpace(null)).toBeNull();
    expect(preferredSpaceValue({ amapSlug: "a", kind: "admin" })).toBe("a/admin");
  });

  it("ne propose de choisir que dans une AMAP où le compte a plusieurs espaces", () => {
    expect(modeChoices(spaces).map((group) => group.map((s) => s.kind))).toEqual([
      ["admin", "famille"],
    ]);
  });
});
