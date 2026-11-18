import { describe, expect, it } from "vitest";

import { homePeriod } from "./family-home";

const p = (month: string, status: "scheduled" | "open" | "closed") => ({
  id: month,
  month,
  status,
});

describe("homePeriod", () => {
  it("met en avant la période ouverte", () => {
    expect(homePeriod([p("2026-11", "closed"), p("2026-12", "open")], "2026-11")).toEqual({
      period: p("2026-12", "open"),
      phase: "open",
    });
  });

  it("sinon, la dernière période clôturée dont le mois n'est pas fini", () => {
    expect(
      homePeriod(
        [p("2026-11", "closed"), p("2026-12", "closed"), p("2027-01", "scheduled")],
        "2026-11",
      ),
    ).toEqual({ period: p("2026-12", "closed"), phase: "closed" });
    // Le mois de novembre est fini : ses commandes ne sont plus à l'accueil.
    expect(homePeriod([p("2026-11", "closed")], "2026-12")).toBeNull();
  });

  it("sinon, la prochaine période prévue", () => {
    expect(homePeriod([p("2027-01", "scheduled"), p("2026-12", "scheduled")], "2026-11")).toEqual({
      period: p("2026-12", "scheduled"),
      phase: "scheduled",
    });
  });

  it("rien sans période", () => {
    expect(homePeriod([], "2026-11")).toBeNull();
  });
});
