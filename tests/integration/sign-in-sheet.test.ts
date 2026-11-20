import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  distribution,
  household,
  order,
  orderLine,
  producer,
  product,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import { getSignInSheet } from "@/server/sign-in-sheet";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Feuille d'émargement (story E3), avec la vraie base et la RLS.
describe("Feuille d'émargement (E3)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };

  const as = (userId: string, secondFactorVerified = true, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified,
  });
  const sheet = (ctx: AmapContext) =>
    withAmapContext(db.app, ctx, (tx, c) => getSignInSheet(tx, c, "2026-12"));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    referent = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapB.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");

    const [martin, dec3, dec10, closed, nov26] = Array.from({ length: 5 }, () => uuidv7()) as [
      string,
      string,
      string,
      string,
      string,
    ];
    await db.owner.insert(household).values({ id: martin, amapId: amapA.id, name: "Foyer Martin" });
    await db.owner.insert(distribution).values([
      { id: dec3, amapId: amapA.id, date: "2026-12-03", startTime: "18:00", endTime: "19:30" },
      { id: dec10, amapId: amapA.id, date: "2026-12-10", startTime: "18:00", endTime: "19:30" },
      {
        id: closed,
        amapId: amapA.id,
        date: "2026-12-24",
        startTime: "18:00",
        endTime: "19:30",
        isOpen: false,
        closedReason: "Fêtes",
      },
      { id: nov26, amapId: amapA.id, date: "2026-11-26", startTime: "18:00", endTime: "19:30" },
    ]);
    const producerId = uuidv7();
    await db.owner.insert(producer).values({ id: producerId, name: "Ferme d'essai" });
    await db.owner.insert(amapProducer).values({ amapId: amapA.id, producerId });
    const [p1, c1, item, o1] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(product).values({ id: p1, producerId, name: "Œufs, boîte de 6" });
    await db.owner.insert(catalog).values({
      id: c1,
      amapId: amapA.id,
      producerId,
      month: "2026-12-01",
      status: "published",
    });
    await db.owner
      .insert(catalogItem)
      .values({ id: item, amapId: amapA.id, catalogId: c1, productId: p1, priceCents: 300 });
    await db.owner
      .insert(order)
      .values({ id: o1, amapId: amapA.id, householdId: martin, catalogId: c1 });
    const line = (distributionId: string, quantity: number) => ({
      amapId: amapA.id,
      orderId: o1,
      catalogItemId: item,
      distributionId,
      quantity,
      unitPriceCents: 300,
    });
    await db.owner.insert(orderLine).values([line(dec3, 2), line(dec10, 0), line(nov26, 5)]);
  });

  it("l'admin obtient la feuille du mois : distributions ouvertes, quantités (accès autorisé)", async () => {
    const result = await sheet(as(admin.id));
    expect(result.distributions.map((d) => d.date)).toEqual(["2026-12-03", "2026-12-10"]);
    expect(result.producers).toEqual([
      {
        name: "Ferme d'essai",
        rows: [{ productName: "Œufs, boîte de 6", perDistribution: [2, 0] }],
      },
    ]);
    expect(result.households.map((h) => h.name)).toEqual(["Foyer Martin"]);
    // Dans une autre AMAP : rien de celle-ci.
    expect(await sheet(as(admin.id, true, amapB.id))).toEqual({
      distributions: [],
      producers: [],
      households: [],
    });
  });

  it("refuse un référent, et un admin sans deuxième vérification (accès refusé)", async () => {
    await expect(sheet(as(referent.id))).rejects.toThrow(ForbiddenError);
    await expect(sheet(as(admin.id, false))).rejects.toThrow(SecondFactorRequiredError);
  });
});
