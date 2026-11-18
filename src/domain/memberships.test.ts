import { describe, expect, it } from "vitest";

import {
  checkMembershipInput,
  coversDay,
  defaultMembershipDays,
  membershipState,
  parseFeeCents,
} from "./memberships";

const year2026 = { startDate: "2026-01-01", endDate: "2026-12-31" };

describe("coversDay", () => {
  it("inclut le jour de début et le jour de fin", () => {
    expect(coversDay([year2026], "2026-01-01")).toBe(true);
    expect(coversDay([year2026], "2026-12-31")).toBe(true);
    expect(coversDay([year2026], "2027-01-01")).toBe(false);
    expect(coversDay([], "2026-06-01")).toBe(false);
  });
});

describe("membershipState", () => {
  it("sans adhésion : aucune", () => {
    expect(membershipState([], "2026-11-18")).toEqual({ status: "none", date: null });
  });

  it("en cours, loin de la fin : active", () => {
    expect(membershipState([year2026], "2026-06-01")).toEqual({
      status: "active",
      date: "2026-12-31",
    });
  });

  it("se termine dans moins de 30 jours : expire bientôt", () => {
    expect(membershipState([year2026], "2026-12-02")).toEqual({
      status: "expiring",
      date: "2026-12-31",
    });
    // Le 1er décembre, il reste 30 jours : encore active.
    expect(membershipState([year2026], "2026-12-01").status).toBe("active");
  });

  it("respecte le délai d'alerte réglé par l'AMAP", () => {
    expect(membershipState([year2026], "2026-11-18", 60).status).toBe("expiring");
  });

  it("n'expire pas bientôt quand l'adhésion suivante commence dès le lendemain", () => {
    const next = { startDate: "2027-01-01", endDate: "2027-12-31" };
    expect(membershipState([next, year2026], "2026-12-20")).toEqual({
      status: "active",
      date: "2027-12-31",
    });
  });

  it("expire bientôt quand l'adhésion suivante laisse un trou", () => {
    const later = { startDate: "2027-02-01", endDate: "2027-12-31" };
    expect(membershipState([year2026, later], "2026-12-20")).toEqual({
      status: "expiring",
      date: "2026-12-31",
    });
  });

  it("aucune en cours mais une plus tard : à venir", () => {
    const later = { startDate: "2027-02-01", endDate: "2027-12-31" };
    expect(membershipState([year2026, later], "2027-01-15")).toEqual({
      status: "upcoming",
      date: "2027-02-01",
    });
  });

  it("toutes terminées : expirée, avec la dernière fin", () => {
    const older = { startDate: "2025-01-01", endDate: "2025-12-31" };
    expect(membershipState([year2026, older], "2027-03-01")).toEqual({
      status: "expired",
      date: "2026-12-31",
    });
  });
});

describe("defaultMembershipDays", () => {
  it("propose un an à partir d'aujourd'hui sans adhésion en cours", () => {
    expect(defaultMembershipDays([], "2026-11-18")).toEqual({
      startDate: "2026-11-18",
      endDate: "2027-11-17",
    });
    expect(defaultMembershipDays([year2026], "2027-03-01").startDate).toBe("2027-03-01");
  });

  it("enchaîne sur l'adhésion en cours pour un renouvellement", () => {
    expect(defaultMembershipDays([year2026], "2026-12-10")).toEqual({
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
  });

  it("gère le 29 février", () => {
    expect(defaultMembershipDays([], "2028-02-29")).toEqual({
      startDate: "2028-02-29",
      endDate: "2029-02-27",
    });
  });
});

describe("parseFeeCents", () => {
  it("lit une cotisation en euros, facultative", () => {
    expect(parseFeeCents("15")).toBe(1500);
    expect(parseFeeCents("12,50 €")).toBe(1250);
    expect(parseFeeCents("  ")).toBeNull();
    expect(parseFeeCents("0")).toBe(0);
    expect(parseFeeCents("0,00")).toBe(0);
  });

  it("refuse un montant mal formé ou négatif", () => {
    expect(parseFeeCents("-5")).toBeUndefined();
    expect(parseFeeCents("douze")).toBeUndefined();
  });
});

describe("checkMembershipInput", () => {
  it("renvoie les valeurs à enregistrer", () => {
    expect(
      checkMembershipInput({ startDate: "2026-01-01", endDate: "2026-12-31", fee: "10" }),
    ).toEqual({ ok: true, startDate: "2026-01-01", endDate: "2026-12-31", feeCents: 1000 });
  });

  it("signale chaque erreur", () => {
    expect(checkMembershipInput({ startDate: "", endDate: "2026-02-30", fee: "x" })).toEqual({
      ok: false,
      errors: ["startDate", "endDate", "fee"],
    });
    expect(
      checkMembershipInput({ startDate: "2026-05-01", endDate: "2026-05-01", fee: "" }),
    ).toEqual({ ok: false, errors: ["end_before_start"] });
  });
});
