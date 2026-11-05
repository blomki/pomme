import { describe, expect, it } from "vitest";

import { formatDate } from "./dates";

// Ces tests vérifient que les dates sont affichées à l'heure de Paris,
// même si l'ordinateur ou le serveur qui exécute le code est réglé sur un autre fuseau.
describe("formatDate", () => {
  it("affiche la date en français", () => {
    expect(formatDate(new Date("2026-11-05T09:00:00Z"))).toBe("5 novembre 2026");
  });

  it("passe au lendemain quand il est déjà minuit à Paris (heure d'hiver, UTC+1)", () => {
    // 23 h 30 en UTC le 4 novembre = 0 h 30 à Paris le 5 novembre.
    expect(formatDate(new Date("2026-11-04T23:30:00Z"), "EEEE d MMMM")).toBe("jeudi 5 novembre");
  });

  it("tient compte de l'heure d'été (UTC+2)", () => {
    expect(formatDate(new Date("2026-07-14T22:30:00Z"), "d MMMM HH:mm")).toBe("15 juillet 00:30");
  });
});
