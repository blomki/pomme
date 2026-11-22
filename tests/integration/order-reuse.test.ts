import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  catalogItemAvailability,
  distribution,
  household,
  householdMember,
  membership,
  order,
  orderLine,
  orderPeriod,
  producer,
  product,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { applyOrderReuse, planOrderReuse } from "@/server/order-reuse";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Commandes de décembre ouvertes du 10 au 25 novembre ; la commande de novembre sert de base.
const NOW = new Date("2026-11-18T10:00:00Z");

// « Reprendre ma commande du mois précédent » (story D4), avec la vraie base et la RLS.
describe("Reprendre la commande du mois précédent (D4)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let family: { id: string };
  let stranger: { id: string };
  let homeId: string;
  let decEggs: string;
  let decHoney: string;
  let dec: string[];

  const as = (userId: string): AmapContext => ({ amapId: amapA.id, userId });
  const run = <T>(userId: string, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, as(userId), fn);

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    family = await f.createUser();
    stranger = await f.createUser();
    homeId = uuidv7();
    await db.owner.insert(household).values({ id: homeId, amapId: amapA.id, name: "Foyer Essai" });
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: homeId, userId: family.id, isPrimary: true });
    await db.owner.insert(membership).values({
      amapId: amapA.id,
      householdId: homeId,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    await db.owner.insert(orderPeriod).values([
      {
        amapId: amapA.id,
        month: "2026-11-01",
        ...periodInstants("2026-10-10", "2026-10-25"),
        status: "closed",
      },
      {
        amapId: amapA.id,
        month: "2026-12-01",
        ...periodInstants("2026-11-10", "2026-11-25"),
        status: "open",
      },
    ]);
    // Novembre : quatre jeudis ; décembre : trois.
    const nov = ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"].map((date) => ({
      id: uuidv7(),
      date,
    }));
    const decDays = ["2026-12-03", "2026-12-10", "2026-12-17"].map((date) => ({
      id: uuidv7(),
      date,
    }));
    dec = decDays.map((d) => d.id);
    await db.owner.insert(distribution).values(
      [...nov, ...decDays].map((d) => ({
        id: d.id,
        amapId: amapA.id,
        date: d.date,
        startTime: "18:00",
        endTime: "19:30",
      })),
    );

    const producerId = uuidv7();
    await db.owner.insert(producer).values({ id: producerId, name: "Ferme d'essai" });
    await db.owner.insert(amapProducer).values({ amapId: amapA.id, producerId });
    const [eggs, honey, bread] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(product).values([
      { id: eggs, producerId, name: "Œufs" },
      { id: honey, producerId, name: "Miel" },
      { id: bread, producerId, name: "Pain" },
    ]);
    const [novCatalog, decCatalog] = [uuidv7(), uuidv7()];
    await db.owner.insert(catalog).values([
      { id: novCatalog, amapId: amapA.id, producerId, month: "2026-11-01", status: "published" },
      { id: decCatalog, amapId: amapA.id, producerId, month: "2026-12-01", status: "published" },
    ]);
    const [novEggs, novHoney, novBread] = [uuidv7(), uuidv7(), uuidv7()];
    [decEggs, decHoney] = [uuidv7(), uuidv7()];
    await db.owner.insert(catalogItem).values([
      { id: novEggs, amapId: amapA.id, catalogId: novCatalog, productId: eggs, priceCents: 300 },
      { id: novHoney, amapId: amapA.id, catalogId: novCatalog, productId: honey, priceCents: 800 },
      { id: novBread, amapId: amapA.id, catalogId: novCatalog, productId: bread, priceCents: 400 },
      // En décembre : plus de pain ; le miel n'est livré que le 3.
      { id: decEggs, amapId: amapA.id, catalogId: decCatalog, productId: eggs, priceCents: 320 },
      { id: decHoney, amapId: amapA.id, catalogId: decCatalog, productId: honey, priceCents: 800 },
    ]);
    await db.owner.insert(catalogItemAvailability).values([
      ...dec.map((distributionId) => ({
        amapId: amapA.id,
        catalogItemId: decEggs,
        distributionId,
      })),
      { amapId: amapA.id, catalogItemId: decHoney, distributionId: dec[0]! },
    ]);

    const novOrder = uuidv7();
    await db.owner
      .insert(order)
      .values({ id: novOrder, amapId: amapA.id, householdId: homeId, catalogId: novCatalog });
    const line = (itemId: string, week: number, quantity: number, price: number) => ({
      amapId: amapA.id,
      orderId: novOrder,
      catalogItemId: itemId,
      distributionId: nov[week]!.id,
      quantity,
      unitPriceCents: price,
    });
    // Œufs : 1, rien, 2, 2 ; miel : 1, 1 ; pain : chaque semaine.
    await db.owner
      .insert(orderLine)
      .values([
        line(novEggs, 0, 1, 300),
        line(novEggs, 2, 2, 300),
        line(novEggs, 3, 2, 300),
        line(novHoney, 0, 1, 800),
        line(novHoney, 1, 1, 800),
        ...[0, 1, 2, 3].map((w) => line(novBread, w, 1, 400)),
      ]);
  });

  it("montre ce qui sera recopié, sans rien enregistrer (accès autorisé)", async () => {
    const preview = await run(family.id, (tx, ctx) => planOrderReuse(tx, ctx, NOW));
    expect(preview).toMatchObject({ status: "ready", previousMonth: "2026-11" });
    if (preview.status !== "ready") return;
    // Semaine par semaine : œufs 1 le 3, rien le 10, 2 le 17 ; miel seulement le 3.
    expect(preview.plan.lines).toEqual([
      { catalogItemId: decHoney, distributionId: dec[0], quantity: 1 },
      { catalogItemId: decEggs, distributionId: dec[0], quantity: 1 },
      { catalogItemId: decEggs, distributionId: dec[2], quantity: 2 },
    ]);
    expect(preview.plan.partial.map((p) => p.name)).toEqual(["Miel"]);
    expect(preview.plan.missing.map((p) => p.name)).toEqual(["Pain"]);
    // Rien n'est enregistré à l'aperçu.
    const decLines = await db.owner
      .select()
      .from(orderLine)
      .where(eq(orderLine.catalogItemId, decEggs));
    expect(decLines).toEqual([]);
  });

  it("recopie après confirmation, comme une saisie de la famille", async () => {
    expect(await run(family.id, (tx, ctx) => applyOrderReuse(tx, ctx, NOW))).toEqual({
      status: "applied",
      saved: 3,
      refused: 0,
    });
    const eggsLines = await db.owner
      .select({
        distributionId: orderLine.distributionId,
        quantity: orderLine.quantity,
        price: orderLine.unitPriceCents,
      })
      .from(orderLine)
      .where(and(eq(orderLine.catalogItemId, decEggs)));
    // Prix du catalogue de décembre, pas celui de novembre.
    expect(eggsLines.sort((a, b) => a.quantity - b.quantity)).toEqual([
      { distributionId: dec[0], quantity: 1, price: 320 },
      { distributionId: dec[2], quantity: 2, price: 320 },
    ]);
  });

  it("refuse une personne sans foyer dans l'AMAP (accès refusé)", async () => {
    expect(await run(stranger.id, (tx, ctx) => planOrderReuse(tx, ctx, NOW))).toEqual({
      status: "no_household",
    });
    expect(await run(stranger.id, (tx, ctx) => applyOrderReuse(tx, ctx, NOW))).toEqual({
      status: "no_household",
    });
  });
});
