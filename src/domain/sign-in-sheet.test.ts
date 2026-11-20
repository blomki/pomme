import { describe, expect, it } from "vitest";

import { buildSignInSheet, type SheetLine } from "./sign-in-sheet";

const distributions = [
  { id: "d10", date: "2026-12-10" },
  { id: "d3", date: "2026-12-03" },
];
const line = (
  householdId: string,
  producerName: string,
  productName: string,
  distributionId: string,
  quantity: number,
): SheetLine => ({
  householdId,
  householdName:
    householdId === "m" ? "Foyer Martin" : householdId === "d" ? "Foyer Dubois" : "Foyer Éluard",
  producerName,
  productName,
  distributionId,
  quantity,
});

describe("buildSignInSheet", () => {
  const sheet = buildSignInSheet({
    distributions,
    lines: [
      line("m", "Ferme du Coteau", "Œufs, boîte de 6", "d3", 1),
      line("d", "Ferme du Coteau", "Œufs, boîte de 6", "d3", 2),
      line("d", "Ferme du Coteau", "Œufs, boîte de 6", "d10", 1),
      line("m", "Boulangerie", "Pain de campagne", "d10", 1),
      line("e", "Ferme du Coteau", "Beurre", "d10", 1),
      line("m", "Boulangerie", "Brioche", "d3", 0), // rien : ignoré
      line("m", "Boulangerie", "Pain", "autre-mois", 3), // hors du mois : ignoré
    ],
  });

  it("met les distributions dans l'ordre des dates", () => {
    expect(sheet.distributions.map((d) => d.date)).toEqual(["2026-12-03", "2026-12-10"]);
  });

  it("partie 1 : livraisons par producteur puis par produit, quantités additionnées", () => {
    expect(sheet.producers).toEqual([
      { name: "Boulangerie", rows: [{ productName: "Pain de campagne", perDistribution: [0, 1] }] },
      {
        name: "Ferme du Coteau",
        rows: [
          { productName: "Beurre", perDistribution: [0, 1] },
          { productName: "Œufs, boîte de 6", perDistribution: [3, 1] },
        ],
      },
    ]);
  });

  it("partie 2 : retraits par foyer (ordre alphabétique, accents compris), produits groupés par producteur", () => {
    expect(sheet.households.map((h) => h.name)).toEqual([
      "Foyer Dubois",
      "Foyer Éluard",
      "Foyer Martin",
    ]);
    expect(sheet.households[2]).toEqual({
      id: "m",
      name: "Foyer Martin",
      producers: [
        {
          name: "Boulangerie",
          rows: [{ productName: "Pain de campagne", perDistribution: [0, 1] }],
        },
        {
          name: "Ferme du Coteau",
          rows: [{ productName: "Œufs, boîte de 6", perDistribution: [1, 0] }],
        },
      ],
    });
  });

  it("reste vide sans commande", () => {
    expect(buildSignInSheet({ distributions, lines: [] })).toMatchObject({
      producers: [],
      households: [],
    });
  });
});
