import { describe, expect, it } from "vitest";

import { suggestAmapSlug, validateAmapSlug } from "./amap-slug";

describe("validateAmapSlug", () => {
  it.each(["hommesdeterre", "amap-cambremer", "amap14", "abc"])("accepte « %s »", (slug) => {
    expect(validateAmapSlug(slug)).toBeNull();
  });

  it("refuse une adresse trop courte", () => {
    expect(validateAmapSlug("ab")).toBe("too_short");
  });

  it("refuse une adresse trop longue", () => {
    expect(validateAmapSlug("a".repeat(41))).toBe("too_long");
  });

  it.each(["Cambremer", "été", "amap cambremer", "_admin", "amap/14"])(
    "refuse les caractères interdits dans « %s »",
    (slug) => {
      expect(validateAmapSlug(slug)).toBe("invalid_characters");
    },
  );

  it.each(["-amap", "amap-", "amap--cambremer"])("refuse le tiret mal placé dans « %s »", (slug) => {
    expect(validateAmapSlug(slug)).toBe("misplaced_hyphen");
  });

  it.each(["producteur", "plateforme", "api"])("refuse le mot réservé « %s »", (slug) => {
    expect(validateAmapSlug(slug)).toBe("reserved");
  });
});

describe("suggestAmapSlug", () => {
  it("met en minuscules et remplace les espaces par des tirets", () => {
    expect(suggestAmapSlug("Les Hommes de Terre")).toBe("les-hommes-de-terre");
  });

  it("retire les accents et les apostrophes", () => {
    expect(suggestAmapSlug("AMAP d'Éterville")).toBe("amap-d-eterville");
  });

  it("ne laisse pas de tiret au début ni à la fin", () => {
    expect(suggestAmapSlug("  « Cambremer » ! ")).toBe("cambremer");
  });

  it("coupe à 40 caractères sans finir par un tiret", () => {
    const slug = suggestAmapSlug(`${"a".repeat(39)} bcd`);
    expect(slug).toBe("a".repeat(39));
    expect(validateAmapSlug(slug)).toBeNull();
  });

  it("propose une adresse valable pour un nom ordinaire", () => {
    expect(validateAmapSlug(suggestAmapSlug("AMAP de Cambremer"))).toBeNull();
  });
});
