import { describe, expect, it } from "vitest";

import {
  checkDutyPlanDays,
  defaultDutyPlanDays,
  dutyPhase,
  dutyReminderDue,
  isQuarterStart,
  keepQuarterDistributions,
  nextQuarterStart,
  quarterRange,
  quarterStartOf,
} from "./duty-plans";
import { periodInstants } from "./order-periods";

describe("trimestres", () => {
  it("trouve le trimestre d'un jour et le suivant", () => {
    expect(quarterStartOf("2026-11-22")).toBe("2026-10-01");
    expect(quarterStartOf("2027-01-01")).toBe("2027-01-01");
    expect(quarterStartOf("2027-06-30")).toBe("2027-04-01");
    expect(nextQuarterStart("2026-11-22")).toBe("2027-01-01");
    expect(nextQuarterStart("2027-03-31")).toBe("2027-04-01");
  });

  it("reconnaît un premier jour de trimestre", () => {
    expect(isQuarterStart("2027-01-01")).toBe(true);
    expect(isQuarterStart("2027-02-01")).toBe(false);
    expect(isQuarterStart("2027-04-02")).toBe(false);
    expect(isQuarterStart("n'importe quoi")).toBe(false);
  });

  it("borne les distributions du trimestre", () => {
    expect(quarterRange("2027-01-01")).toEqual({ from: "2027-01-01", to: "2027-04-01" });
    expect(quarterRange("2027-10-01")).toEqual({ from: "2027-10-01", to: "2028-01-01" });
  });
});

describe("période de réponse", () => {
  it("propose du 22 novembre au 13 décembre pour le trimestre de janvier", () => {
    expect(defaultDutyPlanDays("2027-01-01")).toEqual({
      opensOn: "2026-11-22",
      deadlineOn: "2026-12-13",
    });
  });

  it("refuse des jours invalides, inversés, ou une date limite dans le trimestre", () => {
    const base = { quarterStart: "2027-01-01", opensOn: "2026-11-22", deadlineOn: "2026-12-13" };
    expect(checkDutyPlanDays(base)).toBeNull();
    expect(checkDutyPlanDays({ ...base, opensOn: "2026-13-01" })).toBe("invalid_day");
    expect(checkDutyPlanDays({ ...base, opensOn: "2026-12-14" })).toBe("order");
    expect(checkDutyPlanDays({ ...base, deadlineOn: "2027-01-01" })).toBe("too_late");
    // Ouverture et date limite le même jour : une journée pour répondre.
    expect(checkDutyPlanDays({ ...base, opensOn: "2026-12-13" })).toBeNull();
  });

  it("est ouverte de 0 h le jour d'ouverture à minuit le jour de la date limite (Paris)", () => {
    const { opensAt, closesAt } = periodInstants("2026-11-22", "2026-12-13");
    const plan = { opensAt, deadlineAt: closesAt };
    expect(dutyPhase(plan, new Date("2026-11-21T22:59:00Z"))).toBe("upcoming");
    expect(dutyPhase(plan, new Date("2026-11-21T23:00:00Z"))).toBe("open");
    expect(dutyPhase(plan, new Date("2026-12-13T22:59:00Z"))).toBe("open");
    expect(dutyPhase(plan, new Date("2026-12-13T23:00:00Z"))).toBe("closed");
  });

  it("relance automatiquement 3 jours avant la date limite, ce jour-là seulement", () => {
    expect(dutyReminderDue({ deadlineOn: "2026-12-13", today: "2026-12-10" })).toBe(true);
    expect(dutyReminderDue({ deadlineOn: "2026-12-13", today: "2026-12-09" })).toBe(false);
    expect(dutyReminderDue({ deadlineOn: "2026-12-13", today: "2026-12-11" })).toBe(false);
  });
});

describe("dates cochées", () => {
  const quarter = ["a", "b", "c"];

  it("garde l'ordre du trimestre, sans doublon ; rien coché = disponible partout", () => {
    expect(keepQuarterDistributions(["c", "a", "c"], quarter)).toEqual(["a", "c"]);
    expect(keepQuarterDistributions([], quarter)).toEqual([]);
  });

  it("refuse une distribution hors du trimestre", () => {
    expect(keepQuarterDistributions(["a", "z"], quarter)).toBeNull();
  });
});
