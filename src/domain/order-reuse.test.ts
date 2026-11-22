import { describe, expect, it } from "vitest";

import { planReuse, type CurrentProduct, type PreviousProduct } from "./order-reuse";

const prev = (productId: string, byWeek: number[], name = productId): PreviousProduct => ({
  productId,
  name,
  producerName: "Ferme d'essai",
  byWeek,
});
const cur = (productId: string, open: boolean[]): CurrentProduct => ({
  productId,
  catalogItemId: `item-${productId}`,
  cells: open.map((o, i) => ({ distributionId: `d${i + 1}`, open: o })),
});

describe("planReuse", () => {
  it("recopie semaine par semaine ; une semaine de plus reprend la dernière", () => {
    const plan = planReuse(
      [prev("oeufs", [1, 0, 2, 2])],
      [cur("oeufs", [true, true, true, true, true])],
    );
    expect(plan.lines).toEqual([
      { catalogItemId: "item-oeufs", distributionId: "d1", quantity: 1 },
      { catalogItemId: "item-oeufs", distributionId: "d3", quantity: 2 },
      { catalogItemId: "item-oeufs", distributionId: "d4", quantity: 2 },
      { catalogItemId: "item-oeufs", distributionId: "d5", quantity: 2 },
    ]);
    expect(plan.copied).toEqual([{ name: "oeufs", producerName: "Ferme d'essai", quantity: 7 }]);
    expect(plan.missing).toEqual([]);
    expect(plan.partial).toEqual([]);
  });

  it("signale sans recopier un produit absent du catalogue", () => {
    const plan = planReuse([prev("miel", [1])], [cur("oeufs", [true])]);
    expect(plan.lines).toEqual([]);
    expect(plan.missing).toEqual([{ name: "miel", producerName: "Ferme d'essai" }]);
  });

  it("une semaine indisponible n'est pas recopiée : produit repris en partie, ou pas du tout", () => {
    const partly = planReuse([prev("pain", [1, 1])], [cur("pain", [true, false])]);
    expect(partly.lines).toHaveLength(1);
    expect(partly.partial).toEqual([{ name: "pain", producerName: "Ferme d'essai" }]);
    const never = planReuse([prev("pain", [1, 1])], [cur("pain", [false, false])]);
    expect(never.lines).toEqual([]);
    expect(never.copied).toEqual([]);
    expect(never.missing).toEqual([{ name: "pain", producerName: "Ferme d'essai" }]);
  });

  it("ignore un produit commandé à 0 tout le mois", () => {
    expect(planReuse([prev("oeufs", [0, 0])], [cur("oeufs", [true, true])])).toEqual({
      lines: [],
      copied: [],
      missing: [],
      partial: [],
    });
  });
});
