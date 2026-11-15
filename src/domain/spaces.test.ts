import { describe, expect, it } from "vitest";

import { landingPath, sortSpaces, spacePath, type AmapSpace } from "./spaces";

const referent: AmapSpace = { amapSlug: "hommesdeterre", amapName: "Cambremer", kind: "referent" };
const famille: AmapSpace = { amapSlug: "hommesdeterre", amapName: "Cambremer", kind: "famille" };
const admin: AmapSpace = { amapSlug: "pays-d-auge", amapName: "Auge", kind: "admin" };

describe("spacePath", () => {
  it("construit l'adresse de l'espace", () => {
    expect(spacePath(referent)).toBe("/hommesdeterre/referent");
  });
});

describe("landingPath", () => {
  it("envoie directement dans l'unique espace", () => {
    expect(landingPath([famille], false)).toBe("/hommesdeterre/famille");
  });

  it("dans une seule AMAP, préfère l'espace de référent à celui de la famille", () => {
    expect(landingPath([famille, referent], false)).toBe("/hommesdeterre/referent");
  });

  it("préfère l'administration à tout le reste", () => {
    const adminHere: AmapSpace = { ...referent, kind: "admin" };
    expect(landingPath([famille, referent, adminHere], false)).toBe("/hommesdeterre/admin");
  });

  it("envoie le gestionnaire sans autre espace vers la plateforme", () => {
    expect(landingPath([], true)).toBe("/plateforme");
  });

  it("envoie vers « Mon compte » quand les espaces sont dans plusieurs AMAP", () => {
    expect(landingPath([referent, admin], false)).toBe("/compte");
  });

  it("envoie vers « Mon compte » le gestionnaire qui a aussi un espace d'AMAP", () => {
    expect(landingPath([famille], true)).toBe("/compte");
  });

  it("envoie vers « Mon compte » un compte sans espace", () => {
    expect(landingPath([], false)).toBe("/compte");
  });
});

describe("sortSpaces", () => {
  it("trie par AMAP, puis administration, référent, famille", () => {
    expect(sortSpaces([famille, referent, admin])).toEqual([admin, referent, famille]);
  });
});
