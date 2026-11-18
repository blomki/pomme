import { describe, expect, it } from "vitest";

import { buildOrderForm, creditLabel, csvCell, orderFormCsv } from "./order-forms";

const distributions = [
  { id: "d1", date: "2026-12-03" },
  { id: "d2", date: "2026-12-10" },
];
const items = [
  { itemId: "eggs", name: "Œufs, boîte de 6", priceCents: 400 },
  { itemId: "honey", name: "Miel", priceCents: 900 },
  { itemId: "jam", name: "Confiture", priceCents: 500 },
];
const line = (
  householdId: string,
  itemId: string,
  distributionId: string,
  quantity: number,
  unitPriceCents = 400,
) => ({
  householdId,
  itemId,
  distributionId,
  quantity,
  unitPriceCents,
});

describe("buildOrderForm", () => {
  const form = buildOrderForm({
    distributions,
    items,
    lines: [
      line("martin", "eggs", "d1", 1),
      line("martin", "eggs", "d2", 1),
      line("dubois", "eggs", "d1", 2),
      // Prix changé entre deux commandes : chaque ligne garde le sien.
      line("dubois", "eggs", "d2", 1, 450),
      line("dubois", "honey", "d2", 1, 900),
      line("petit", "honey", "d1", 0, 900),
    ],
    households: [
      { id: "martin", name: "Foyer Martin", cheque: { creditsCents: 400, expectedCents: 400 } },
      { id: "dubois", name: "Foyer Dubois", cheque: null },
      { id: "petit", name: "Foyer Petit", cheque: null },
    ],
  });

  it("totalise chaque produit par distribution, au prix de chaque ligne", () => {
    expect(form.products).toEqual([
      {
        itemId: "eggs",
        name: "Œufs, boîte de 6",
        priceCents: 400,
        perDistribution: [3, 2],
        totalQuantity: 5,
        amountCents: 1 * 400 + 1 * 400 + 2 * 400 + 1 * 450,
      },
      {
        itemId: "honey",
        name: "Miel",
        priceCents: 900,
        perDistribution: [0, 1],
        totalQuantity: 1,
        amountCents: 900,
      },
    ]);
    expect(form.totalCents).toBe(2050 + 900);
  });

  it("détaille chaque foyer qui a commandé, par nom, avec son chèque", () => {
    expect(form.households.map((h) => h.name)).toEqual(["Foyer Dubois", "Foyer Martin"]);
    const [dubois, martin] = form.households;
    expect(dubois).toMatchObject({ grossCents: 2150, creditsCents: null, expectedCents: 2150 });
    expect(dubois!.rows).toEqual([
      { itemId: "eggs", name: "Œufs, boîte de 6", perDistribution: [2, 1] },
      { itemId: "honey", name: "Miel", perDistribution: [0, 1] },
    ]);
    // Après la clôture : avoir déduit et chèque calculé.
    expect(martin).toMatchObject({ grossCents: 800, creditsCents: 400, expectedCents: 400 });
  });

  it("reste vide sans commande", () => {
    expect(buildOrderForm({ distributions, items, lines: [], households: [] })).toEqual({
      distributions,
      products: [],
      households: [],
      totalCents: 0,
    });
  });
});

describe("csvCell", () => {
  it("met entre guillemets ce qui contient un séparateur", () => {
    expect(csvCell("Œufs; boîte")).toBe('"Œufs; boîte"');
    expect(csvCell('Le "bio"')).toBe('"Le ""bio"""');
    expect(csvCell(3)).toBe("3");
  });

  it("neutralise un texte qui ressemble à une formule", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-2")).toBe("'-2");
  });
});

describe("orderFormCsv", () => {
  it("donne les quantités à préparer puis le détail par foyer", () => {
    const form = buildOrderForm({
      distributions,
      items,
      lines: [line("martin", "eggs", "d1", 2)],
      households: [
        { id: "martin", name: "Foyer Martin", cheque: { creditsCents: 400, expectedCents: 400 } },
      ],
    });
    const csv = orderFormCsv(form, {
      title: "Bon de commande",
      product: "Produit",
      price: "Prix",
      total: "Total",
      amount: "Montant",
      household: "Foyer",
      credit: "Avoir",
      expected: "Chèque attendu",
      day: (date) => date.slice(8),
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toEqual([
      "\uFEFFBon de commande",
      "",
      "Produit;Prix;03;10;Total;Montant",
      "Œufs, boîte de 6;4,00;2;0;2;8,00",
      "Total;;;;;8,00",
      "",
      "Foyer;Produit;03;10;Avoir;Chèque attendu",
      "Foyer Martin;Œufs, boîte de 6;2;0;4,00;4,00",
      "",
    ]);
  });
});

describe("creditLabel", () => {
  it("affiche l'avoir déduit, ou un tiret", () => {
    expect(creditLabel(400)).toMatch(/^− 4,00\s€$/);
    expect(creditLabel(null)).toBe("—");
    expect(creditLabel(0)).toBe("—");
  });
});
