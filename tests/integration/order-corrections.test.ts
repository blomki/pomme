import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  auditLog,
  catalog,
  catalogItem,
  catalogItemAvailability,
  cheque,
  distribution,
  household,
  householdMember,
  orderLine,
  orderPeriod,
  producer,
  product,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import {
  correctOrderQuantities,
  correctOrderQuantity,
  getHouseholdOrderOverview,
  getOrderCorrection,
  listCorrectableHouseholds,
} from "@/server/order-corrections";
import { getFamilyOrder } from "@/server/orders";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Commandes de décembre 2026, ouvertes du 10 au 25 novembre.
const NOW = new Date("2026-11-18T10:00:00Z");
const AFTER_CLOSING = new Date("2026-11-28T10:00:00Z");

// Correction de la commande d'un foyer par un référent ou un admin (story D7), avec la vraie
// base et la RLS.
describe("Corriger la commande d'un foyer (D7)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let referent: { id: string }; // suit la ferme
  let otherReferent: { id: string }; // suit le fournil seulement
  let admin: { id: string };
  let family: { id: string }; // membre du foyer corrigé
  let homeId: string;
  let archivedHomeId: string;
  let farm: string; // amap_producer de la ferme
  let bakery: string; // amap_producer du fournil
  let periodId: string;
  let farmProducerId: string;
  let eggs: string;
  let bread: string;
  let dec3: string;
  let dec10: string;

  const as = (userId: string, secondFactorVerified = false, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified,
  });
  const correct = (
    ctx: AmapContext,
    line: { catalogItemId: string; distributionId: string; quantity: number },
    amapProducerId = farm,
    householdId = homeId,
    now = NOW,
  ) =>
    withAmapContext(db.app, ctx, (tx, c) =>
      correctOrderQuantity(tx, c, { householdId, amapProducerId, ...line }, now),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    referent = await f.createUser();
    otherReferent = await f.createUser();
    admin = await f.createUser();
    family = await f.createUser();
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");
    await f.grantRole(amapA.id, admin.id, "admin");

    [homeId, archivedHomeId] = [uuidv7(), uuidv7()];
    await db.owner.insert(household).values([
      { id: homeId, amapId: amapA.id, name: "Foyer Martin" },
      { id: archivedHomeId, amapId: amapA.id, name: "Foyer Parti", archivedAt: new Date() },
    ]);
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: homeId, userId: family.id, isPrimary: true });

    periodId = uuidv7();
    await db.owner.insert(orderPeriod).values({
      id: periodId,
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-10", "2026-11-25"),
      status: "open",
    });
    [dec3, dec10] = [uuidv7(), uuidv7()];
    await db.owner.insert(distribution).values([
      { id: dec3, amapId: amapA.id, date: "2026-12-03", startTime: "18:00", endTime: "19:30" },
      { id: dec10, amapId: amapA.id, date: "2026-12-10", startTime: "18:00", endTime: "19:30" },
    ]);

    farmProducerId = uuidv7();
    const bakeryProducerId = uuidv7();
    await db.owner.insert(producer).values([
      { id: farmProducerId, name: "Ferme d'essai" },
      { id: bakeryProducerId, name: "Fournil d'essai" },
    ]);
    [farm, bakery] = [uuidv7(), uuidv7()];
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId: farmProducerId },
      { id: bakery, amapId: amapA.id, producerId: bakeryProducerId },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: referent.id },
      { amapId: amapA.id, amapProducerId: bakery, userId: otherReferent.id },
    ]);
    const [p1, p2] = [uuidv7(), uuidv7()];
    await db.owner.insert(product).values([
      { id: p1, producerId: farmProducerId, name: "Œufs, boîte de 6" },
      { id: p2, producerId: bakeryProducerId, name: "Pain de campagne" },
    ]);
    const [farmCatalog, bakeryCatalog] = [uuidv7(), uuidv7()];
    await db.owner.insert(catalog).values([
      {
        id: farmCatalog,
        amapId: amapA.id,
        producerId: farmProducerId,
        month: "2026-12-01",
        status: "published",
      },
      {
        id: bakeryCatalog,
        amapId: amapA.id,
        producerId: bakeryProducerId,
        month: "2026-12-01",
        status: "published",
      },
    ]);
    [eggs, bread] = [uuidv7(), uuidv7()];
    await db.owner.insert(catalogItem).values([
      { id: eggs, amapId: amapA.id, catalogId: farmCatalog, productId: p1, priceCents: 300 },
      { id: bread, amapId: amapA.id, catalogId: bakeryCatalog, productId: p2, priceCents: 450 },
    ]);
    await db.owner.insert(catalogItemAvailability).values([
      { amapId: amapA.id, catalogItemId: eggs, distributionId: dec3 },
      { amapId: amapA.id, catalogItemId: eggs, distributionId: dec10 },
      { amapId: amapA.id, catalogItemId: bread, distributionId: dec3 },
    ]);
  });

  it("le référent du producteur corrige, au prix du catalogue, et le journal le garde (accès autorisé)", async () => {
    expect(
      await correct(as(referent.id), { catalogItemId: eggs, distributionId: dec3, quantity: 2 }),
    ).toEqual({ status: "saved", quantity: 2, unitPriceCents: 300 });

    // Le prix du catalogue change : la correction suivante prend le nouveau prix.
    await db.owner.update(catalogItem).set({ priceCents: 350 }).where(eq(catalogItem.id, eggs));
    expect(
      await correct(as(referent.id), { catalogItemId: eggs, distributionId: dec3, quantity: 3 }),
    ).toEqual({ status: "saved", quantity: 3, unitPriceCents: 350 });
    // Même quantité retapée : rien de plus au journal.
    await correct(as(referent.id), { catalogItemId: eggs, distributionId: dec3, quantity: 3 });

    const entries = await db.owner
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "order"), eq(auditLog.action, "correct")))
      .orderBy(auditLog.createdAt);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => [e.actorUserId, e.before, e.after])).toEqual([
      [
        referent.id,
        expect.objectContaining({ householdId: homeId, quantity: 0, unitPriceCents: null }),
        expect.objectContaining({
          householdId: homeId,
          catalogItemId: eggs,
          distributionId: dec3,
          quantity: 2,
          unitPriceCents: 300,
        }),
      ],
      [
        referent.id,
        expect.objectContaining({ quantity: 2, unitPriceCents: 300 }),
        expect.objectContaining({ quantity: 3, unitPriceCents: 350 }),
      ],
    ]);
  });

  it("la famille voit sa commande corrigée", async () => {
    const own = await withAmapContext(db.app, as(family.id), (tx, ctx) =>
      getFamilyOrder(tx, ctx, NOW),
    );
    if (own.state !== "open") throw new Error(own.state);
    const farmOrder = own.producers.find((p) => p.name === "Ferme d'essai")!;
    expect(farmOrder).toMatchObject({ status: "complete", totalCents: 3 * 350 });
  });

  it("l'admin corrige chez tous les producteurs, après la deuxième vérification", async () => {
    expect(
      await correct(
        as(admin.id, true),
        { catalogItemId: bread, distributionId: dec3, quantity: 1 },
        bakery,
      ),
    ).toMatchObject({ status: "saved" });
    await expect(
      correct(
        as(admin.id, false),
        { catalogItemId: bread, distributionId: dec3, quantity: 2 },
        bakery,
      ),
    ).rejects.toThrow(SecondFactorRequiredError);
    const overview = await withAmapContext(db.app, as(admin.id, true), (tx, ctx) =>
      getHouseholdOrderOverview(tx, ctx, homeId, NOW),
    );
    expect(overview).toMatchObject({
      state: "open",
      producers: [
        { name: "Ferme d'essai", status: "complete", totalCents: 1050 },
        { name: "Fournil d'essai", status: "complete", totalCents: 450 },
      ],
    });
  });

  it("le référent d'un autre producteur et la famille sont refusés (accès refusé)", async () => {
    const line = { catalogItemId: eggs, distributionId: dec3, quantity: 5 };
    await expect(correct(as(otherReferent.id), line)).rejects.toThrow(ForbiddenError);
    await expect(correct(as(family.id), line)).rejects.toThrow(ForbiddenError);
    await expect(
      withAmapContext(db.app, as(otherReferent.id), (tx, ctx) =>
        getOrderCorrection(tx, ctx, { householdId: homeId, amapProducerId: farm }, NOW),
      ),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      withAmapContext(db.app, as(referent.id), (tx, ctx) =>
        getHouseholdOrderOverview(tx, ctx, homeId, NOW),
      ),
    ).rejects.toThrow(ForbiddenError);
    // Le produit d'un autre producteur ne passe pas par la page d'un producteur suivi.
    expect(
      await correct(as(referent.id), { catalogItemId: bread, distributionId: dec3, quantity: 1 }),
    ).toEqual({ status: "invalid" });
  });

  it("garde les contrôles de la saisie : disponibilité, chèque pointé, période clôturée", async () => {
    // Pain pas disponible le 10 décembre.
    expect(
      await correct(
        as(admin.id, true),
        { catalogItemId: bread, distributionId: dec10, quantity: 1 },
        bakery,
      ),
    ).toEqual({ status: "locked", reason: "unavailable" });
    // Foyer archivé.
    expect(
      await correct(
        as(referent.id),
        { catalogItemId: eggs, distributionId: dec10, quantity: 1 },
        farm,
        archivedHomeId,
      ),
    ).toEqual({ status: "not_found" });
    // Période clôturée : il faut la rouvrir.
    expect(
      await correct(
        as(referent.id),
        { catalogItemId: eggs, distributionId: dec10, quantity: 1 },
        farm,
        homeId,
        AFTER_CLOSING,
      ),
    ).toEqual({ status: "closed" });
    // Chèque pointé : la commande chez ce producteur ne bouge plus.
    await db.owner.insert(cheque).values({
      amapId: amapA.id,
      householdId: homeId,
      producerId: farmProducerId,
      orderPeriodId: periodId,
      grossCents: 1050,
      creditsCents: 0,
      expectedCents: 1050,
      status: "received",
    });
    expect(
      await correct(as(referent.id), { catalogItemId: eggs, distributionId: dec10, quantity: 1 }),
    ).toEqual({ status: "locked", reason: "cheque_received" });
  });

  it("corrige plusieurs cases d'un coup, et liste les foyers de l'AMAP seulement", async () => {
    const results = await withAmapContext(db.app, as(admin.id, true), (tx, ctx) =>
      correctOrderQuantities(
        tx,
        ctx,
        {
          householdId: homeId,
          amapProducerId: bakery,
          lines: [
            { catalogItemId: bread, distributionId: dec3, quantity: 2 },
            { catalogItemId: bread, distributionId: dec10, quantity: 2 },
          ],
        },
        NOW,
      ),
    );
    expect(results).toEqual([
      { status: "saved", quantity: 2, unitPriceCents: 450 },
      { status: "locked", reason: "unavailable" },
    ]);
    const lines = await db.owner.select().from(orderLine).where(eq(orderLine.catalogItemId, bread));
    expect(lines.map((l) => l.quantity)).toEqual([2]);

    const households = await withAmapContext(db.app, as(referent.id), (tx, ctx) =>
      listCorrectableHouseholds(tx, ctx, farm),
    );
    expect(households.map((h) => h.name)).toEqual(["Foyer Martin"]);
    // Dans une autre AMAP, le référent n'a aucun rôle.
    await expect(
      withAmapContext(db.app, as(referent.id, false, amapB.id), (tx, ctx) =>
        listCorrectableHouseholds(tx, ctx, farm),
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});
