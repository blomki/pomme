import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amap,
  amapProducer,
  catalog,
  catalogItem,
  catalogItemAvailability,
  cheque,
  distribution,
  household,
  householdMember,
  membership,
  orderPeriod,
  producer,
  product,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { getFamilyCheques, getFamilyHome } from "@/server/family-home";
import { setOrderQuantity } from "@/server/orders";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Commandes de décembre 2026 ouvertes du 15 au 25 novembre ; distributions les 3 et 10 décembre.
const BEFORE = new Date("2026-11-10T10:00:00Z"); // pas encore ouvertes
const OPEN = new Date("2026-11-18T10:00:00Z");
const CLOSED = new Date("2026-11-28T10:00:00Z");

// Accueil de la famille (story D6), avec la vraie base et la RLS.
describe("Accueil famille (D6)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let family: { id: string };
  let stranger: { id: string };
  let homeId: string;
  let periodId: string;
  let producerId: string;
  let itemId: string;
  let dec3: string;

  const run = <T>(userId: string, fn: Parameters<typeof withAmapContext<T>>[2]) => {
    const ctx: AmapContext = { amapId: amapA.id, userId, secondFactorVerified: false };
    return withAmapContext(db.app, ctx, fn);
  };
  const home = (now: Date, userId = family.id) =>
    run(userId, (tx, ctx) => getFamilyHome(tx, ctx, now));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    await db.owner
      .update(amap)
      .set({ distributionPlace: "Salle des fêtes" })
      .where(eq(amap.id, amapA.id));
    family = await f.createUser();
    stranger = await f.createUser();
    homeId = uuidv7();
    await db.owner.insert(household).values({ id: homeId, amapId: amapA.id, name: "Foyer Essai" });
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: homeId, userId: family.id, isPrimary: true });
    // Adhésion jusqu'au 5 décembre : « expire bientôt » en novembre.
    await db.owner.insert(membership).values({
      amapId: amapA.id,
      householdId: homeId,
      startDate: "2026-01-01",
      endDate: "2026-12-05",
    });

    periodId = uuidv7();
    await db.owner.insert(orderPeriod).values({
      id: periodId,
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-15", "2026-11-25"),
    });
    dec3 = uuidv7();
    await db.owner.insert(distribution).values([
      { id: dec3, amapId: amapA.id, date: "2026-12-03", startTime: "18:00", endTime: "19:30" },
      { amapId: amapA.id, date: "2026-12-10", startTime: "18:00", endTime: "19:30" },
    ]);
    producerId = uuidv7();
    await db.owner.insert(producer).values({ id: producerId, name: "Ferme d'essai" });
    await db.owner
      .insert(amapProducer)
      .values({ amapId: amapA.id, producerId, checkPayee: "GAEC d'essai" });
    const productId = uuidv7();
    await db.owner.insert(product).values({ id: productId, producerId, name: "Œufs, boîte de 6" });
    const catalogId = uuidv7();
    await db.owner.insert(catalog).values({
      id: catalogId,
      amapId: amapA.id,
      producerId,
      month: "2026-12-01",
      status: "published",
    });
    itemId = uuidv7();
    await db.owner
      .insert(catalogItem)
      .values({ id: itemId, amapId: amapA.id, catalogId, productId, priceCents: 300 });
    await db.owner
      .insert(catalogItemAvailability)
      .values({ amapId: amapA.id, catalogItemId: itemId, distributionId: dec3 });
  });

  it("avant l'ouverture : la date d'ouverture, et le rappel d'adhésion", async () => {
    expect(await home(BEFORE)).toMatchObject({
      state: "ready",
      membership: { status: "expiring", date: "2026-12-05" },
      period: { phase: "scheduled", month: "2026-12", opensOn: "2026-11-15" },
    });
  });

  it("ouvertes sans commande, puis avec commande", async () => {
    expect((await home(OPEN)) as unknown).toMatchObject({
      period: { phase: "open", chequeCount: 0, totalCents: 0, treated: 0, producerCount: 1 },
    });
    await run(family.id, (tx, ctx) =>
      setOrderQuantity(tx, ctx, { catalogItemId: itemId, distributionId: dec3, quantity: 2 }, OPEN),
    );
    expect((await home(OPEN)) as unknown).toMatchObject({
      period: { phase: "open", closesOn: "2026-11-25", chequeCount: 1, totalCents: 600 },
    });
    expect(await run(family.id, (tx, ctx) => getFamilyCheques(tx, ctx, OPEN))).toEqual({
      state: "open",
    });
  });

  it("clôturées : chèques à signer et distribution où les remettre", async () => {
    await db.owner
      .update(orderPeriod)
      .set({ status: "closed" })
      .where(eq(orderPeriod.id, periodId));
    await db.owner.insert(cheque).values({
      amapId: amapA.id,
      householdId: homeId,
      producerId,
      orderPeriodId: periodId,
      grossCents: 600,
      creditsCents: 100,
      expectedCents: 500,
    });
    const result = await home(CLOSED);
    expect(result).toMatchObject({
      period: {
        phase: "closed",
        month: "2026-12",
        chequeCount: 1,
        totalCents: 500,
        handOverOn: "2026-12-03",
      },
      nextDistribution: {
        date: "2026-12-03",
        startTime: "18:00",
        place: "Salle des fêtes",
        lines: [{ product: "Œufs, boîte de 6", producer: "Ferme d'essai", quantity: 2 }],
      },
    });
    expect(await run(family.id, (tx, ctx) => getFamilyCheques(tx, ctx, CLOSED))).toEqual({
      state: "closed",
      month: "2026-12",
      handOverOn: "2026-12-03",
      cheques: [
        {
          producer: "Ferme d'essai",
          checkPayee: "GAEC d'essai",
          grossCents: 600,
          creditsCents: 100,
          expectedCents: 500,
          status: "expected",
        },
      ],
    });
  });

  it("un compte sans foyer dans l'AMAP ne voit rien (accès refusé)", async () => {
    expect(await home(OPEN, stranger.id)).toEqual({ state: "no_household" });
    expect(await run(stranger.id, (tx, ctx) => getFamilyCheques(tx, ctx, CLOSED))).toEqual({
      state: "no_household",
    });
  });
});
