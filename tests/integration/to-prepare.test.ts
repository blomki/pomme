import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  distribution,
  household,
  householdMember,
  order,
  orderLine,
  orderPeriod,
  producer,
  producerUser,
  product,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError } from "@/server/auth/errors";
import { getToPrepare } from "@/server/to-prepare";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Commandes de décembre ouvertes du 10 au 25 novembre.
const OPEN = new Date("2026-11-20T10:00:00Z");
const CLOSED = new Date("2026-11-28T10:00:00Z");
const AFTER_FIRST = new Date("2026-12-04T10:00:00Z"); // lendemain de la distribution du 3

// « À préparer » du producteur (story E5), avec la vraie base et la RLS.
describe("À préparer (E5)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let farmer: { id: string };
  let referent: { id: string };
  let otherReferent: { id: string };
  let family: { id: string };
  let farm: string;
  let dec3: string;
  let dec10: string;

  const as = (userId: string): AmapContext => ({ amapId: amapA.id, userId });
  const read = (userId: string, now: Date, distributionId?: string) =>
    withAmapContext(db.app, as(userId), (tx, c) =>
      getToPrepare(tx, c, { amapProducerId: farm, distributionId }, now),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    farmer = await f.createUser();
    referent = await f.createUser();
    otherReferent = await f.createUser();
    family = await f.createUser();
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");

    const [farmProducer, bakeryProducer] = [uuidv7(), uuidv7()];
    await db.owner.insert(producer).values([
      { id: farmProducer, name: "Ferme d'essai" },
      { id: bakeryProducer, name: "Fournil d'essai" },
    ]);
    farm = uuidv7();
    const bakery = uuidv7();
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId: farmProducer },
      { id: bakery, amapId: amapA.id, producerId: bakeryProducer },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: referent.id },
      { amapId: amapA.id, amapProducerId: bakery, userId: otherReferent.id },
    ]);
    await db.owner.insert(producerUser).values({ producerId: farmProducer, userId: farmer.id });

    const [martin, dubois] = [uuidv7(), uuidv7()];
    await db.owner.insert(household).values([
      { id: martin, amapId: amapA.id, name: "Foyer Martin" },
      { id: dubois, amapId: amapA.id, name: "Foyer Dubois" },
    ]);
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: martin, userId: family.id, isPrimary: true });
    await db.owner.insert(orderPeriod).values({
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-10", "2026-11-25"),
    });
    [dec3, dec10] = [uuidv7(), uuidv7()];
    await db.owner.insert(distribution).values([
      { id: dec3, amapId: amapA.id, date: "2026-12-03", startTime: "18:00", endTime: "19:30" },
      { id: dec10, amapId: amapA.id, date: "2026-12-10", startTime: "18:00", endTime: "19:30" },
    ]);
    const [eggsProduct, breadProduct, c1, c2, eggs, bread] = Array.from({ length: 6 }, () =>
      uuidv7(),
    ) as [string, string, string, string, string, string];
    await db.owner.insert(product).values([
      { id: eggsProduct, producerId: farmProducer, name: "Œufs, boîte de 6" },
      { id: breadProduct, producerId: bakeryProducer, name: "Pain" },
    ]);
    await db.owner.insert(catalog).values([
      {
        id: c1,
        amapId: amapA.id,
        producerId: farmProducer,
        month: "2026-12-01",
        status: "published",
      },
      {
        id: c2,
        amapId: amapA.id,
        producerId: bakeryProducer,
        month: "2026-12-01",
        status: "published",
      },
    ]);
    await db.owner.insert(catalogItem).values([
      { id: eggs, amapId: amapA.id, catalogId: c1, productId: eggsProduct, priceCents: 300 },
      { id: bread, amapId: amapA.id, catalogId: c2, productId: breadProduct, priceCents: 450 },
    ]);
    const [o1, o2, o3] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(order).values([
      { id: o1, amapId: amapA.id, householdId: martin, catalogId: c1 },
      { id: o2, amapId: amapA.id, householdId: dubois, catalogId: c1 },
      { id: o3, amapId: amapA.id, householdId: martin, catalogId: c2 },
    ]);
    const line = (orderId: string, itemId: string, day: string, quantity: number) => ({
      amapId: amapA.id,
      orderId,
      catalogItemId: itemId,
      distributionId: day,
      quantity,
      unitPriceCents: 300,
    });
    await db.owner
      .insert(orderLine)
      .values([
        line(o1, eggs, dec3, 1),
        line(o2, eggs, dec3, 2),
        line(o2, eggs, dec10, 1),
        line(o3, bread, dec3, 4),
      ]);
  });

  it("avant la clôture, rien à préparer : le jour de clôture est annoncé", async () => {
    expect(await read(farmer.id, OPEN)).toEqual({
      weeks: [],
      chosen: null,
      prepare: { products: [], households: [] },
      nextClosesOn: "2026-11-25",
    });
  });

  it("après la clôture, le producteur voit la semaine : totaux et paniers (accès autorisé)", async () => {
    const view = await read(farmer.id, CLOSED);
    expect(view.weeks.map((w) => w.date)).toEqual(["2026-12-03", "2026-12-10"]);
    expect(view.chosen?.date).toBe("2026-12-03");
    // Seulement ses produits : pas le pain du fournil.
    expect(view.prepare).toEqual({
      products: [{ name: "Œufs, boîte de 6", quantity: 3 }],
      households: [
        { name: "Foyer Dubois", items: [{ name: "Œufs, boîte de 6", quantity: 2 }] },
        { name: "Foyer Martin", items: [{ name: "Œufs, boîte de 6", quantity: 1 }] },
      ],
    });
    // Le lendemain, la semaine suivante est proposée ; la précédente reste consultable.
    const later = await read(farmer.id, AFTER_FIRST);
    expect(later.chosen?.date).toBe("2026-12-10");
    expect((await read(farmer.id, AFTER_FIRST, dec3)).chosen?.date).toBe("2026-12-03");
    // Le référent du producteur la voit aussi.
    expect((await read(referent.id, CLOSED)).prepare.products).toHaveLength(1);
  });

  it("refuse le référent d'un autre producteur et la famille (accès refusé)", async () => {
    await expect(read(otherReferent.id, CLOSED)).rejects.toThrow(ForbiddenError);
    await expect(read(family.id, CLOSED)).rejects.toThrow(ForbiddenError);
  });
});
