import { describe, expect, it } from "vitest";

import {
  parseDistanceKm,
  pickCurrentAmap,
  producerAccess,
  producerHomeTask,
  producersWithoutReferent,
} from "./producers";

describe("producersWithoutReferent", () => {
  it("signale les producteurs actifs sans référent, par nom", () => {
    const list = [
      { name: "Œufs du Val", active: true, referentCount: 0 },
      { name: "Boulangerie", active: true, referentCount: 2 },
      { name: "Atelier fromager", active: true, referentCount: 0 },
      { name: "Cidrerie", active: false, referentCount: 0 },
    ];
    expect(producersWithoutReferent(list).map((p) => p.name)).toEqual([
      "Atelier fromager",
      "Œufs du Val",
    ]);
  });
});

describe("parseDistanceKm", () => {
  it.each([
    ["12", 12],
    [" 0 ", 0],
    ["1000", 1000],
    ["", null],
    ["  ", null],
  ])("lit « %s »", (input, expected) => {
    expect(parseDistanceKm(input)).toBe(expected);
  });

  it.each(["-3", "12,5", "abc", "1001", "99999"])("refuse « %s »", (input) => {
    expect(parseDistanceKm(input)).toBeUndefined();
  });
});

describe("producerAccess", () => {
  it("dit « pas de compte » sans compte", () => {
    expect(producerAccess([])).toBe("none");
  });

  it("dit « invitation envoyée » tant qu'aucun compte ne s'est connecté", () => {
    expect(producerAccess([{ emailVerified: false }])).toBe("invited");
  });

  it("dit « compte actif » dès qu'un compte s'est connecté", () => {
    expect(producerAccess([{ emailVerified: false }, { emailVerified: true }])).toBe("active");
  });
});

describe("pickCurrentAmap", () => {
  const amaps = [{ amapProducerId: "a" }, { amapProducerId: "b" }];

  it("garde l'AMAP choisie si elle est toujours dans la liste", () => {
    expect(pickCurrentAmap(amaps, "b")).toBe(amaps[1]);
  });

  it("prend la première AMAP sans choix, ou si le choix n'est plus dans la liste", () => {
    expect(pickCurrentAmap(amaps, null)).toBe(amaps[0]);
    expect(pickCurrentAmap(amaps, "retiree")).toBe(amaps[0]);
  });

  it("ne renvoie rien pour une liste vide", () => {
    expect(pickCurrentAmap([], "a")).toBeUndefined();
  });
});

describe("producerHomeTask", () => {
  const december = { month: "2026-12", opensOn: "2026-11-15", status: "scheduled" as const };

  it("vise la première période pas encore clôturée", () => {
    expect(
      producerHomeTask({
        nextMonth: "2026-12",
        periods: [
          { month: "2027-01", opensOn: "2026-12-15", status: "scheduled" },
          december,
          { month: "2026-11", opensOn: "2026-10-15", status: "closed" },
        ],
        publishedMonths: [],
      }),
    ).toEqual({ month: "2026-12", opensOn: "2026-11-15", ordersOpen: false });
  });

  it("signale des commandes déjà ouvertes", () => {
    expect(
      producerHomeTask({
        nextMonth: "2026-12",
        periods: [{ ...december, status: "open" }],
        publishedMonths: [],
      }),
    ).toEqual({ month: "2026-12", opensOn: "2026-11-15", ordersOpen: true });
  });

  it("vise le mois prochain, sans date, quand l'admin n'a pas encore fixé la période", () => {
    expect(producerHomeTask({ nextMonth: "2026-12", periods: [], publishedMonths: [] })).toEqual({
      month: "2026-12",
      opensOn: null,
      ordersOpen: false,
    });
  });

  it("ne demande rien quand le catalogue du mois visé est publié", () => {
    expect(
      producerHomeTask({ nextMonth: "2026-12", periods: [december], publishedMonths: ["2026-12"] }),
    ).toBeNull();
    expect(
      producerHomeTask({ nextMonth: "2026-12", periods: [], publishedMonths: ["2026-12"] }),
    ).toBeNull();
  });

  it("ne demande rien quand les commandes du mois prochain sont déjà clôturées", () => {
    expect(
      producerHomeTask({
        nextMonth: "2026-12",
        periods: [{ ...december, status: "closed" }],
        publishedMonths: [],
      }),
    ).toBeNull();
  });
});
