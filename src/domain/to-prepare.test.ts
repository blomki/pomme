import { describe, expect, it } from "vitest";

import { buildOrderForm } from "./order-forms";
import { defaultWeek, weekToPrepare } from "./to-prepare";

const distributions = [
  { id: "d3", date: "2026-12-03" },
  { id: "d10", date: "2026-12-10" },
];
const form = buildOrderForm({
  distributions,
  items: [
    { itemId: "eggs", name: "Œufs, boîte de 6", priceCents: 400 },
    { itemId: "honey", name: "Miel", priceCents: 900 },
  ],
  lines: [
    { householdId: "m", itemId: "eggs", distributionId: "d3", quantity: 1, unitPriceCents: 400 },
    { householdId: "d", itemId: "eggs", distributionId: "d3", quantity: 2, unitPriceCents: 400 },
    { householdId: "d", itemId: "honey", distributionId: "d10", quantity: 1, unitPriceCents: 900 },
  ],
  households: [
    { id: "m", name: "Foyer Martin", cheque: null },
    { id: "d", name: "Foyer Dubois", cheque: null },
  ],
});

describe("weekToPrepare", () => {
  it("donne les totaux de la semaine, puis chaque panier", () => {
    expect(weekToPrepare(form, "d3")).toEqual({
      products: [{ name: "Œufs, boîte de 6", quantity: 3 }],
      households: [
        { name: "Foyer Dubois", items: [{ name: "Œufs, boîte de 6", quantity: 2 }] },
        { name: "Foyer Martin", items: [{ name: "Œufs, boîte de 6", quantity: 1 }] },
      ],
    });
    // Le 10 : seul le foyer Dubois a quelque chose.
    expect(weekToPrepare(form, "d10").households.map((h) => h.name)).toEqual(["Foyer Dubois"]);
  });

  it("reste vide pour une distribution absente du bon de commande", () => {
    expect(weekToPrepare(form, "inconnue")).toEqual({ products: [], households: [] });
  });
});

describe("defaultWeek", () => {
  it("propose la prochaine distribution, aujourd'hui compris, sinon la dernière", () => {
    expect(defaultWeek(distributions, "2026-12-01")).toBe("d3");
    expect(defaultWeek(distributions, "2026-12-03")).toBe("d3");
    expect(defaultWeek(distributions, "2026-12-04")).toBe("d10");
    expect(defaultWeek(distributions, "2026-12-20")).toBe("d10");
    expect(defaultWeek([], "2026-12-20")).toBeNull();
  });
});
