import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext } from "@/db/context";
import { amapProducer, catalog, orderPeriod, producer, producerUser, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError } from "@/server/auth/errors";
import { getProducerHomeTask } from "@/server/catalogs";
import { chooseCurrentProducerAmap, getMyProducerAmaps } from "@/server/producer-amaps";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Jour fixe : commandes de décembre 2026 prévues du 20 au 25 novembre.
const NOW = new Date("2026-11-18T10:00:00Z");

// AMAP courante et accueil du producteur (story C4), avec la vraie base et la RLS.
describe("AMAP courante du producteur (C4)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let farmer: { id: string };
  let neighbour: { id: string }; // compte d'un autre producteur
  let inA: string;
  let inB: string;
  let neighbourInA: string;
  let producerId: string;

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    farmer = await f.createUser();
    neighbour = await f.createUser();

    producerId = uuidv7();
    const neighbourId = uuidv7();
    await db.owner.insert(producer).values([
      { id: producerId, name: "Ruches d'essai" },
      { id: neighbourId, name: "Ferme voisine" },
    ]);
    [inA, inB, neighbourInA] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(amapProducer).values([
      { id: inA, amapId: amapA.id, producerId },
      { id: inB, amapId: amapB.id, producerId },
      { id: neighbourInA, amapId: amapA.id, producerId: neighbourId },
    ]);
    await db.owner.insert(producerUser).values([
      { producerId, userId: farmer.id },
      { producerId: neighbourId, userId: neighbour.id },
    ]);
  });

  it("prend la première AMAP tant que le producteur n'a rien choisi", async () => {
    const { amaps, current } = await getMyProducerAmaps(farmer.id, db.app);
    expect(amaps).toHaveLength(2);
    expect(current?.amapProducerId).toBe(inA);
  });

  it("garde le choix avec le compte, retrouvé à la lecture suivante (accès autorisé)", async () => {
    expect(await chooseCurrentProducerAmap(farmer.id, { amapProducerId: inB }, db.app)).toEqual({
      status: "saved",
      amapName: "AMAP amap-b",
    });
    const { current } = await getMyProducerAmaps(farmer.id, db.app);
    expect(current?.amapProducerId).toBe(inB);
  });

  it("refuse l'AMAP d'un autre producteur et une saisie mal formée (accès refusé)", async () => {
    for (const input of [{ amapProducerId: neighbourInA }, { amapProducerId: "x" }, {}]) {
      expect(await chooseCurrentProducerAmap(farmer.id, input, db.app)).toEqual({
        status: "forbidden",
      });
    }
    // Le choix précédent n'a pas bougé.
    const [row] = await db.owner
      .select({ id: user.currentAmapProducerId })
      .from(user)
      .where(eq(user.id, farmer.id));
    expect(row?.id).toBe(inB);
  });

  it("revient à la première AMAP quand l'AMAP choisie n'est plus livrée", async () => {
    await db.owner.update(amapProducer).set({ active: false }).where(eq(amapProducer.id, inB));
    try {
      const { current } = await getMyProducerAmaps(farmer.id, db.app);
      expect(current?.amapProducerId).toBe(inA);
    } finally {
      await db.owner.update(amapProducer).set({ active: true }).where(eq(amapProducer.id, inB));
    }
  });

  it("met en avant le catalogue à publier avant l'ouverture, puis plus rien une fois publié", async () => {
    const task = () =>
      withAmapContext(
        db.app,
        { amapId: amapA.id, userId: farmer.id, secondFactorVerified: false },
        (tx, ctx) => getProducerHomeTask(tx, ctx, inA, NOW),
      );
    // Sans période : le mois prochain, sans date.
    expect(await task()).toEqual({ month: "2026-12", opensOn: null, ordersOpen: false });

    await db.owner.insert(orderPeriod).values({
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-20", "2026-11-25"),
    });
    expect(await task()).toEqual({ month: "2026-12", opensOn: "2026-11-20", ordersOpen: false });

    await db.owner
      .insert(catalog)
      .values({ amapId: amapA.id, producerId, month: "2026-12-01", status: "published" });
    expect(await task()).toBeNull();
  });

  it("refuse l'accueil d'un producteur à un autre compte", async () => {
    await expect(
      withAmapContext(
        db.app,
        { amapId: amapA.id, userId: neighbour.id, secondFactorVerified: false },
        (tx, ctx) => getProducerHomeTask(tx, ctx, inA, NOW),
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});
