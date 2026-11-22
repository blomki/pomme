import { describe, expect, it } from "vitest";

import {
  addDays,
  checkPeriodDays,
  chequeKey,
  chequesAtClosing,
  defaultPeriodDays,
  dueTransition,
  effectiveStatus,
  parisDay,
  parseDay,
  periodDays,
  periodInstants,
  reminderDue,
} from "./order-periods";

describe("parseDay et addDays", () => {
  it("accepte un vrai jour du calendrier", () => {
    expect(parseDay("2026-11-25")).toBe("2026-11-25");
    expect(parseDay(" 2028-02-29 ")).toBe("2028-02-29");
  });

  it("refuse un jour qui n'existe pas ou mal écrit", () => {
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("25/11/2026")).toBeNull();
    expect(parseDay("")).toBeNull();
  });

  it("change de mois et d'année", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("defaultPeriodDays", () => {
  it("propose du 15 au 25 du mois d'avant", () => {
    expect(defaultPeriodDays("2026-12")).toEqual({ opensOn: "2026-11-15", closesOn: "2026-11-25" });
    expect(defaultPeriodDays("2027-01")).toEqual({ opensOn: "2026-12-15", closesOn: "2026-12-25" });
  });
});

describe("periodInstants, periodDays et parisDay", () => {
  it("ouvre à 0 h et ferme à minuit, heure de Paris (heure d'hiver)", () => {
    const { opensAt, closesAt } = periodInstants("2026-11-15", "2026-11-25");
    expect(opensAt.toISOString()).toBe("2026-11-14T23:00:00.000Z");
    expect(closesAt.toISOString()).toBe("2026-11-25T23:00:00.000Z");
    expect(periodDays({ opensAt, closesAt })).toEqual({
      opensOn: "2026-11-15",
      closesOn: "2026-11-25",
    });
  });

  it("suit l'heure d'été", () => {
    const { opensAt } = periodInstants("2026-06-15", "2026-06-25");
    expect(opensAt.toISOString()).toBe("2026-06-14T22:00:00.000Z");
  });

  it("donne le jour de Paris, pas celui d'UTC", () => {
    expect(parisDay(new Date("2026-11-25T23:30:00Z"))).toBe("2026-11-26");
    expect(parisDay(new Date("2026-11-25T22:30:00Z"))).toBe("2026-11-25");
  });
});

describe("effectiveStatus et dueTransition", () => {
  const period = {
    status: "scheduled" as const,
    opensAt: new Date("2026-11-14T23:00:00Z"),
    closesAt: new Date("2026-11-25T23:00:00Z"),
  };
  const before = new Date("2026-11-10T12:00:00Z");
  const during = new Date("2026-11-20T12:00:00Z");
  const after = new Date("2026-11-26T12:00:00Z");

  it("suit l'heure, même avant le passage de la tâche planifiée", () => {
    expect(effectiveStatus(period, before)).toBe("scheduled");
    expect(effectiveStatus(period, during)).toBe("open");
    expect(effectiveStatus(period, after)).toBe("closed");
    expect(effectiveStatus({ ...period, status: "closed" }, during)).toBe("closed");
  });

  it("dit à la tâche planifiée quoi faire", () => {
    expect(dueTransition(period, before)).toBeNull();
    expect(dueTransition(period, during)).toBe("open");
    expect(dueTransition({ ...period, status: "open" }, during)).toBeNull();
    expect(dueTransition({ ...period, status: "open" }, after)).toBe("close");
    // Ouverture manquée (serveur arrêté) : on clôture directement.
    expect(dueTransition(period, after)).toBe("close");
    expect(dueTransition({ ...period, status: "closed" }, after)).toBeNull();
  });
});

describe("checkPeriodDays", () => {
  const today = "2026-11-18";

  it("accepte des jours cohérents, ouverture passée comprise", () => {
    expect(checkPeriodDays({ opensOn: "2026-11-15", closesOn: "2026-11-25" }, today)).toEqual({
      opensOn: "2026-11-15",
      closesOn: "2026-11-25",
    });
    expect(checkPeriodDays({ opensOn: "2026-11-18", closesOn: "2026-11-18" }, today)).toEqual({
      opensOn: "2026-11-18",
      closesOn: "2026-11-18",
    });
  });

  it("refuse une clôture avant l'ouverture ou déjà passée", () => {
    expect(checkPeriodDays({ opensOn: "2026-11-25", closesOn: "2026-11-20" }, today)).toEqual({
      errors: ["before_opening"],
    });
    expect(checkPeriodDays({ opensOn: "2026-11-01", closesOn: "2026-11-17" }, today)).toEqual({
      errors: ["past"],
    });
  });

  it("signale les jours mal saisis", () => {
    expect(checkPeriodDays({ opensOn: "", closesOn: "2026-02-30" }, today)).toEqual({
      errors: ["opensOn", "closesOn"],
    });
  });
});

describe("chequesAtClosing", () => {
  const line = (householdId: string, producerId: string, quantity: number, price: number) => ({
    householdId,
    producerId,
    quantity,
    unitPriceCents: price,
  });

  it("un chèque par foyer et par producteur, au total commandé", () => {
    const cheques = chequesAtClosing(
      [
        line("h1", "p1", 2, 450),
        line("h1", "p1", 1, 300),
        line("h1", "p2", 3, 100),
        line("h2", "p1", 0, 450),
      ],
      [],
    );
    expect(cheques).toEqual([
      {
        householdId: "h1",
        producerId: "p1",
        grossCents: 1200,
        creditsCents: 0,
        expectedCents: 1200,
        credits: [],
      },
      {
        householdId: "h1",
        producerId: "p2",
        grossCents: 300,
        creditsCents: 0,
        expectedCents: 300,
        credits: [],
      },
    ]);
  });

  it("déduit les avoirs du foyer chez ce producteur, du plus ancien au plus récent", () => {
    const [cheque] = chequesAtClosing(
      [line("h1", "p1", 4, 500)],
      [
        { id: "0002", householdId: "h1", producerId: "p1", amountCents: 300 },
        { id: "0001", householdId: "h1", producerId: "p1", amountCents: 400 },
        { id: "0003", householdId: "h1", producerId: "p2", amountCents: 900 },
        { id: "0004", householdId: "h2", producerId: "p1", amountCents: 900 },
      ],
    );
    expect(cheque).toMatchObject({ grossCents: 2000, creditsCents: 700, expectedCents: 1300 });
    expect(cheque?.credits).toEqual([
      { id: "0001", deductedCents: 400, remainderCents: 0 },
      { id: "0002", deductedCents: 300, remainderCents: 0 },
    ]);
  });

  it("ne rend jamais un chèque négatif : le reste d'un avoir attend la commande suivante", () => {
    const [cheque] = chequesAtClosing(
      [line("h1", "p1", 1, 600)],
      [
        { id: "0001", householdId: "h1", producerId: "p1", amountCents: 1000 },
        { id: "0002", householdId: "h1", producerId: "p1", amountCents: 200 },
      ],
    );
    expect(cheque).toMatchObject({ grossCents: 600, creditsCents: 600, expectedCents: 0 });
    expect(cheque?.credits).toEqual([{ id: "0001", deductedCents: 600, remainderCents: 400 }]);
  });

  it("ne recalcule pas un chèque déjà pointé", () => {
    const cheques = chequesAtClosing(
      [line("h1", "p1", 1, 600), line("h2", "p1", 1, 600)],
      [],
      new Set([chequeKey("h1", "p1")]),
    );
    expect(cheques.map((c) => c.householdId)).toEqual(["h2"]);
  });

  it("aucun chèque sans commande", () => {
    expect(
      chequesAtClosing([], [{ id: "1", householdId: "h", producerId: "p", amountCents: 5 }]),
    ).toEqual([]);
  });
});

describe("reminderDue", () => {
  const closesOn = "2026-11-25";
  it("à partir de N jours avant la clôture, jusqu'au jour de clôture", () => {
    expect(
      ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"].map((today) =>
        reminderDue({ closesOn, today, daysBefore: 2 }),
      ),
    ).toEqual([false, true, true, true, false]);
  });

  it("0 jour : rappel désactivé", () => {
    expect(reminderDue({ closesOn, today: "2026-11-25", daysBefore: 0 })).toBe(false);
  });
});
