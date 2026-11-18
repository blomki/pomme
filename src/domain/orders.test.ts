import { describe, expect, it } from "vitest";

import { cellLock, linesTotal, parseQuantity, producerOrderStatus, treatedCount } from "./orders";

describe("parseQuantity", () => {
  it("lit un entier de 0 à 99, vide valant 0", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity(" 12 ")).toBe(12);
    expect(parseQuantity("")).toBe(0);
    expect(parseQuantity("0")).toBe(0);
  });

  it("refuse le reste", () => {
    for (const input of ["-1", "1,5", "100", "deux", "1e2"]) {
      expect(parseQuantity(input)).toBeNull();
    }
  });
});

describe("producerOrderStatus", () => {
  it("complété dès qu'une quantité est saisie, même après « rien ce mois-ci »", () => {
    expect(producerOrderStatus({ quantities: [0, 1], declined: false })).toBe("complete");
    expect(producerOrderStatus({ quantities: [2], declined: true })).toBe("complete");
  });

  it("rien ce mois-ci seulement sur choix du foyer, sinon à compléter", () => {
    expect(producerOrderStatus({ quantities: [0, 0], declined: true })).toBe("nothing");
    expect(producerOrderStatus({ quantities: [0], declined: false })).toBe("todo");
    expect(producerOrderStatus({ quantities: [], declined: false })).toBe("todo");
  });
});

describe("treatedCount", () => {
  it("compte les producteurs complétés ou « rien ce mois-ci »", () => {
    expect(treatedCount(["complete", "todo", "nothing", "complete"])).toBe(3);
  });
});

describe("linesTotal", () => {
  it("additionne quantité × prix, en centimes", () => {
    expect(
      linesTotal([
        { quantity: 2, unitPriceCents: 450 },
        { quantity: 0, unitPriceCents: 900 },
        { quantity: 1, unitPriceCents: 1210 },
      ]),
    ).toBe(2110);
    expect(linesTotal([])).toBe(0);
  });
});

describe("cellLock", () => {
  const open = { today: "2026-11-18", available: true, chequeReceived: false };

  it("laisse modifier une distribution à venir où le produit est disponible", () => {
    expect(cellLock({ ...open, distributionDate: "2026-12-03" })).toBeNull();
  });

  it("fige les distributions passées et celle du jour", () => {
    expect(cellLock({ ...open, distributionDate: "2026-11-18" })).toBe("past");
    expect(cellLock({ ...open, distributionDate: "2026-11-11" })).toBe("past");
  });

  it("refuse un produit indisponible", () => {
    expect(cellLock({ ...open, distributionDate: "2026-12-03", available: false })).toBe(
      "unavailable",
    );
  });

  it("fige tout chez un producteur dont le chèque est pointé", () => {
    expect(cellLock({ ...open, distributionDate: "2026-12-03", chequeReceived: true })).toBe(
      "cheque_received",
    );
  });
});
