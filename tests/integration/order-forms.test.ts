import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  cheque,
  distribution,
  household,
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
import {
  defaultOrderFormMonth,
  getOrderForm,
  loadOrderForm,
  producerEmail,
} from "@/server/order-forms";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

const NOW = new Date("2026-11-28T10:00:00Z"); // commandes de décembre clôturées le 25 novembre

// Bon de commande d'un producteur (story E1), avec la vraie base et la RLS.
describe("Bon de commande (E1)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let referent: { id: string };
  let otherReferent: { id: string };
  let admin: { id: string };
  let farmer: { id: string };
  let farm: string; // amap_producer
  let otherFarm: string;

  const as = (userId: string | null, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const read = (userId: string, amapProducerId = farm) =>
    withAmapContext(db.app, as(userId), (tx, ctx) =>
      getOrderForm(tx, ctx, { amapProducerId, month: "2026-12" }, NOW),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    referent = await f.createUser();
    otherReferent = await f.createUser();
    admin = await f.createUser();
    farmer = await f.createUser();
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");
    await f.grantRole(amapA.id, admin.id, "admin");

    const [producerId, otherProducerId] = [uuidv7(), uuidv7()];
    await db.owner.insert(producer).values([
      { id: producerId, name: "Ferme d'essai", email: "ferme@example.org" },
      { id: otherProducerId, name: "Fournil d'essai" },
    ]);
    [farm, otherFarm] = [uuidv7(), uuidv7()];
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId },
      { id: otherFarm, amapId: amapA.id, producerId: otherProducerId },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: referent.id },
      { amapId: amapA.id, amapProducerId: otherFarm, userId: otherReferent.id },
    ]);
    await db.owner.insert(producerUser).values({ producerId, userId: farmer.id });

    const periodId = uuidv7();
    await db.owner.insert(orderPeriod).values({
      id: periodId,
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-15", "2026-11-25"),
      status: "closed",
      closedAt: new Date("2026-11-25T23:00:00Z"),
    });
    const [d1, d2, closedDay] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(distribution).values([
      { id: d1, amapId: amapA.id, date: "2026-12-03", startTime: "18:00", endTime: "19:30" },
      { id: d2, amapId: amapA.id, date: "2026-12-10", startTime: "18:00", endTime: "19:30" },
      {
        id: closedDay,
        amapId: amapA.id,
        date: "2026-12-31",
        startTime: "18:00",
        endTime: "19:30",
        isOpen: false,
        closedReason: "Fêtes",
      },
    ]);
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
    const itemId = uuidv7();
    await db.owner
      .insert(catalogItem)
      .values({ id: itemId, amapId: amapA.id, catalogId, productId, priceCents: 400 });

    const [martin, dubois] = [uuidv7(), uuidv7()];
    await db.owner.insert(household).values([
      { id: martin, amapId: amapA.id, name: "Foyer Martin" },
      { id: dubois, amapId: amapA.id, name: "Foyer Dubois" },
    ]);
    const [o1, o2] = [uuidv7(), uuidv7()];
    await db.owner.insert(order).values([
      { id: o1, amapId: amapA.id, householdId: martin, catalogId },
      { id: o2, amapId: amapA.id, householdId: dubois, catalogId },
    ]);
    await db.owner.insert(orderLine).values([
      {
        amapId: amapA.id,
        orderId: o1,
        catalogItemId: itemId,
        distributionId: d1,
        quantity: 1,
        unitPriceCents: 400,
      },
      {
        amapId: amapA.id,
        orderId: o1,
        catalogItemId: itemId,
        distributionId: d2,
        quantity: 1,
        unitPriceCents: 400,
      },
      {
        amapId: amapA.id,
        orderId: o2,
        catalogItemId: itemId,
        distributionId: d1,
        quantity: 2,
        unitPriceCents: 400,
      },
    ]);
    await db.owner.insert(cheque).values({
      amapId: amapA.id,
      householdId: martin,
      producerId,
      orderPeriodId: periodId,
      grossCents: 800,
      creditsCents: 400,
      expectedCents: 400,
    });
  });

  it("le référent du producteur lit le bon de commande (accès autorisé)", async () => {
    const view = await read(referent.id);
    expect(view).toMatchObject({
      producerName: "Ferme d'essai",
      month: "2026-12",
      period: { status: "closed", closesOn: "2026-11-25" },
    });
    // La distribution fermée sans commande n'apparaît pas.
    expect(view!.form.distributions.map((d) => d.date)).toEqual(["2026-12-03", "2026-12-10"]);
    expect(view!.form.products).toEqual([
      expect.objectContaining({ perDistribution: [3, 1], totalQuantity: 4, amountCents: 1600 }),
    ]);
    expect(view!.form.households.map((h) => [h.name, h.creditsCents, h.expectedCents])).toEqual([
      ["Foyer Dubois", null, 800],
      ["Foyer Martin", 400, 400],
    ]);
  });

  it("le producteur lit aussi son propre bon de commande", async () => {
    expect((await read(farmer.id))?.form.totalCents).toBe(1600);
  });

  it("un autre référent, ou un admin qui ne suit pas ce producteur, est refusé (accès refusé)", async () => {
    await expect(read(otherReferent.id)).rejects.toThrow(ForbiddenError);
    await expect(read(admin.id)).rejects.toThrow(ForbiddenError);
  });

  it("par le lien signé, se lit sans compte, dans l'AMAP seulement", async () => {
    const link = (amapId: string): AmapContext => ({
      ...as(null, amapId),
      trusted: "order_form_link",
    });
    const view = await withAmapContext(db.app, link(amapA.id), (tx) =>
      loadOrderForm(tx, farm, "2026-12", NOW),
    );
    expect(view?.form.households).toHaveLength(2);
    // Dans une autre AMAP, rien n'est visible.
    expect(
      await withAmapContext(db.app, link(amapB.id), (tx) =>
        loadOrderForm(tx, farm, "2026-12", NOW),
      ),
    ).toBeNull();
    // Sans l'accès du lien signé (visiteur anonyme) : aucune commande (S12).
    const anonymous = await withAmapContext(db.app, as(null), (tx) =>
      loadOrderForm(tx, farm, "2026-12", NOW),
    );
    expect(anonymous?.form.households).toEqual([]);
  });

  it("propose le mois des commandes en cours, et l'email de la fiche du producteur", async () => {
    await withAmapContext(db.app, as(referent.id), async (tx) => {
      expect(await defaultOrderFormMonth(tx, NOW)).toBe("2026-12");
      expect(await producerEmail(tx, farm)).toBe("ferme@example.org");
      expect(await producerEmail(tx, otherFarm)).toBeNull();
    });
    // Mois sans commande : bon de commande vide.
    const empty = await withAmapContext(db.app, as(referent.id), (tx, ctx) =>
      getOrderForm(tx, ctx, { amapProducerId: farm, month: "2027-01" }, NOW),
    );
    expect(empty).toMatchObject({ period: null, form: { products: [], households: [] } });
  });
});
