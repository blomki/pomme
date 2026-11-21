import { describe, expect, it } from "vitest";

import { checkJoinRequest, isOpen, looksLikeEmail, splitName } from "./join-requests";

describe("checkJoinRequest", () => {
  it("nettoie une demande valable", () => {
    expect(
      checkJoinRequest({
        name: "  Camille   Le Goff ",
        email: " Camille@Example.org ",
        phone: "06 12 34 56 78",
        message: " Bonjour ! ",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Camille Le Goff",
        email: "camille@example.org",
        phone: "+33612345678",
        message: "Bonjour !",
      },
    });
    // Téléphone et message facultatifs.
    expect(checkJoinRequest({ name: "A", email: "a@b.fr", phone: " ", message: "" })).toMatchObject(
      {
        ok: true,
        value: { phone: null, message: "" },
      },
    );
  });

  it("signale chaque champ non valable", () => {
    expect(
      checkJoinRequest({
        name: " ",
        email: "pas-un-email",
        phone: "12",
        message: "x".repeat(1001),
      }),
    ).toEqual({ ok: false, problems: ["name", "email", "phone", "message"] });
  });
});

describe("looksLikeEmail", () => {
  it("accepte une adresse ordinaire, refuse le reste", () => {
    expect(looksLikeEmail("a.b+c@example.org")).toBe(true);
    for (const bad of [
      "a@b",
      "@b.fr",
      "a@@b.fr",
      "a b@c.fr",
      "a@b.",
      "a@.fr",
      `${"x".repeat(250)}@b.fr`,
    ]) {
      expect(looksLikeEmail(bad)).toBe(false);
    }
  });
});

describe("isOpen et splitName", () => {
  it("une demande acceptée ou refusée est close", () => {
    expect(["new", "contacted", "accepted", "declined"].map((s) => isOpen(s as never))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("propose prénom et nom d'après le nom saisi", () => {
    expect(splitName("Camille Le Goff")).toEqual({ firstName: "Camille", lastName: "Le Goff" });
    expect(splitName(" Dominique ")).toEqual({ firstName: "Dominique", lastName: "" });
  });
});
