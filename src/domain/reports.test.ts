import { describe, expect, it } from "vitest";

import { periodInstants } from "./order-periods";
import { canReport, checkReport, MAX_REPORT_COMMENT_LENGTH, reportDeadline } from "./reports";

describe("checkReport", () => {
  const base = {
    reason: "missing" as const,
    comment: "",
    quantity: 1,
    ordered: 2,
    alreadyReported: 0,
  };

  it("accepte une quantité de 1 à ce qui a été commandé", () => {
    expect(checkReport(base)).toEqual([]);
    expect(checkReport({ ...base, quantity: 2 })).toEqual([]);
  });

  it("refuse une quantité nulle, décimale, ou au-delà de ce qui reste à signaler", () => {
    expect(checkReport({ ...base, quantity: 0 })).toEqual(["quantity"]);
    expect(checkReport({ ...base, quantity: 1.5 })).toEqual(["quantity"]);
    expect(checkReport({ ...base, quantity: 3 })).toEqual(["quantity"]);
    // Déjà 1 signalé sur 2 : il n'en reste qu'un.
    expect(checkReport({ ...base, quantity: 2, alreadyReported: 1 })).toEqual(["quantity"]);
  });

  it("exige une précision pour « Autre », et la limite en longueur", () => {
    expect(checkReport({ ...base, reason: "other", comment: "  " })).toEqual(["comment_required"]);
    expect(checkReport({ ...base, reason: "other", comment: "Pain trop cuit" })).toEqual([]);
    expect(checkReport({ ...base, comment: "a".repeat(MAX_REPORT_COMMENT_LENGTH + 1) })).toEqual([
      "comment_too_long",
    ]);
  });
});

describe("reportDeadline et canReport", () => {
  // Distribution du jeudi 3 décembre ; commandes de janvier clôturées le 25 décembre au soir.
  const distributionEnd = periodInstants("2026-12-03", "2026-12-03").closesAt;
  const decemberClosing = periodInstants("2026-11-10", "2026-11-25").closesAt;
  const januaryClosing = periodInstants("2026-12-10", "2026-12-25").closesAt;

  it("va jusqu'à la clôture qui suit la distribution", () => {
    expect(reportDeadline(distributionEnd, [januaryClosing, decemberClosing])).toEqual(
      januaryClosing,
    );
    // Aucune clôture prévue après : pas de limite pour l'instant.
    expect(reportDeadline(distributionEnd, [decemberClosing])).toBeNull();
  });

  it("ne signale qu'une distribution passée, avant cette clôture", () => {
    const deadline = januaryClosing;
    const at = (iso: string, today: string) =>
      canReport({ distributionDate: "2026-12-03", today, now: new Date(iso), deadline });
    expect(at("2026-12-02T10:00:00Z", "2026-12-02")).toBe(false); // pas encore eu lieu
    expect(at("2026-12-03T19:00:00Z", "2026-12-03")).toBe(true); // le soir même
    expect(at("2026-12-25T22:00:00Z", "2026-12-25")).toBe(true); // dernier jour
    expect(at("2026-12-25T23:30:00Z", "2026-12-26")).toBe(false); // clôture passée
    expect(
      canReport({
        distributionDate: "2026-12-03",
        today: "2027-03-01",
        now: new Date(),
        deadline: null,
      }),
    ).toBe(true);
  });
});
