import { describe, expect, it } from "vitest";

import { bannerGroupFor, bannerImageFor, isBannerGroup } from "./banner-images";

describe("bannerGroupFor", () => {
  it.each([
    ["/hommesdeterre/admin", "dashboard"],
    ["/hommesdeterre/referent", "dashboard"],
    ["/hommesdeterre/admin/reglages", "dashboard"],
    ["/hommesdeterre/admin/reprise", "dashboard"],
    ["/hommesdeterre/admin/foyers/0193", "households"],
    ["/hommesdeterre/admin/producteurs/nouveau", "producers"],
    ["/hommesdeterre/referent/catalogue", "producers"],
    ["/hommesdeterre/referent/bons-de-commande/corriger/a/b", "producers"],
    ["/hommesdeterre/admin/planning/permanences", "planning"],
    ["/hommesdeterre/admin/cheques", "money"],
    ["/hommesdeterre/referent/avoirs", "money"],
    ["/hommesdeterre/admin/signalements", "money"],
    ["/hommesdeterre/admin/emails", "communication"],
    ["/hommesdeterre/admin/pages/nouvelle", "communication"],
    ["/hommesdeterre/admin/ecran-a-venir", "dashboard"],
    ["/hommesdeterre/admin/constructor", "dashboard"],
    ["/hommesdeterre/admin/foyers?onglet=demandes", "households"],
  ])("%s → %s", (path, group) => {
    expect(bannerGroupFor(path)).toBe(group);
  });

  it("ignore les autres espaces", () => {
    expect(bannerGroupFor("/hommesdeterre/famille")).toBeNull();
    expect(bannerGroupFor("/plateforme/comptes")).toBeNull();
    expect(bannerGroupFor("/hommesdeterre/administration")).toBeNull();
  });
});

describe("bannerImageFor", () => {
  const images = { households: "https://f/bandeaux/foyers.webp" };

  it("prend l'image de la famille, sinon le logo, sinon rien", () => {
    expect(bannerImageFor("/a/admin/foyers", images, "https://f/logo.webp")).toBe(
      "https://f/bandeaux/foyers.webp",
    );
    expect(bannerImageFor("/a/admin/cheques", images, "https://f/logo.webp")).toBe(
      "https://f/logo.webp",
    );
    expect(bannerImageFor("/a/admin/cheques", images, null)).toBeNull();
  });
});

describe("isBannerGroup", () => {
  it("reconnaît les familles, et seulement elles", () => {
    expect(isBannerGroup("money")).toBe(true);
    expect(isBannerGroup("logo")).toBe(false);
    expect(isBannerGroup(undefined)).toBe(false);
  });
});
