import { describe, expect, it } from "vitest";

import {
  addMonths,
  closedReason,
  distributionDates,
  isValidTimeRange,
  monthOf,
  parseMonth,
  sameWeekDate,
} from "./distributions";

describe("distributionDates", () => {
  it("donne les 5 mardis de décembre 2026", () => {
    expect(distributionDates("2026-12", 2)).toEqual([
      "2026-12-01",
      "2026-12-08",
      "2026-12-15",
      "2026-12-22",
      "2026-12-29",
    ]);
  });

  it("donne les 4 vendredis de février 2027", () => {
    expect(distributionDates("2027-02", 5)).toEqual([
      "2027-02-05",
      "2027-02-12",
      "2027-02-19",
      "2027-02-26",
    ]);
  });

  it("gère le dimanche et une année bissextile", () => {
    expect(distributionDates("2028-02", 7)).toEqual([
      "2028-02-06",
      "2028-02-13",
      "2028-02-20",
      "2028-02-27",
    ]);
    expect(distributionDates("2028-02", 2)).toContain("2028-02-29");
  });

  it("ne dépend pas du passage à l'heure d'hiver", () => {
    // Fin octobre : changement d'heure le dimanche 25 octobre 2026.
    expect(distributionDates("2026-10", 1)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
  });
});

describe("mois", () => {
  it("lit un mois valable", () => {
    expect(parseMonth(" 2026-12 ")).toBe("2026-12");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("décembre")).toBeNull();
  });

  it("avance et recule d'un mois, y compris d'une année à l'autre", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });

  it("donne le mois d'un jour", () => {
    expect(monthOf("2026-12-08")).toBe("2026-12");
  });
});

describe("horaires et motif", () => {
  it("exige un début avant la fin", () => {
    expect(isValidTimeRange("18:00", "19:30")).toBe(true);
    expect(isValidTimeRange("19:30", "18:00")).toBe(false);
    expect(isValidTimeRange("18:00", "18:00")).toBe(false);
    expect(isValidTimeRange("25:00", "26:00")).toBe(false);
  });

  it("exige un motif de fermeture, nettoyé", () => {
    expect(closedReason("  Vacances   de Noël ")).toBe("Vacances de Noël");
    expect(closedReason("   ")).toBeNull();
    expect(closedReason("x".repeat(121))).toBeNull();
  });
});

describe("sameWeekDate", () => {
  it("déplace au jour demandé de la même semaine, dans les deux sens", () => {
    expect(sameWeekDate("2026-12-08", 4)).toBe("2026-12-10");
    expect(sameWeekDate("2026-12-10", 2)).toBe("2026-12-08");
  });

  it("reste dans la semaine du lundi au dimanche, même en changeant de mois", () => {
    expect(sameWeekDate("2027-03-30", 4)).toBe("2027-04-01");
    expect(sameWeekDate("2026-12-06", 1)).toBe("2026-11-30");
  });

  it("ne change rien si c'est déjà le bon jour", () => {
    expect(sameWeekDate("2026-12-10", 4)).toBe("2026-12-10");
  });
});
