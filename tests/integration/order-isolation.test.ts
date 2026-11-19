import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { Transaction } from "@/db/client";
import { withAmapContext, type AmapContext, type TrustedAccess } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  cheque,
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

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Isolation des commandes, lignes et chèques par foyer (fiche S12, ADR 0021) : requêtes directes
// avec la connexion de l'application, pour vérifier la base elle-même et pas le code serveur.
describe("Isolation des commandes par foyer (RLS)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let martin: { id: string }; // membre du foyer Martin
  let dubois: { id: string }; // membre du foyer Dubois
  let formerMember: { id: string }; // ancien membre (archivé) du foyer Martin
  let farmReferent: { id: string };
  let bakeryReferent: { id: string };
  let admin: { id: string };
  let farmer: { id: string }; // compte du producteur de la ferme
  const ids = {
    martinHome: uuidv7(),
    duboisHome: uuidv7(),
    farmProducer: uuidv7(),
    bakeryProducer: uuidv7(),
    period: uuidv7(),
    martinFarm: uuidv7(), // commande de Martin à la ferme
    duboisFarm: uuidv7(),
    martinBakery: uuidv7(),
    martinFarmLine: uuidv7(),
    duboisFarmLine: uuidv7(),
    martinBakeryLine: uuidv7(),
    eggs: uuidv7(),
    bread: uuidv7(),
    day: uuidv7(),
  };

  const ctx = (userId: string | null, trusted?: TrustedAccess, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    trusted,
  });
  const as = <T>(context: AmapContext, fn: (tx: Transaction) => Promise<T>) =>
    withAmapContext(db.app, context, (tx) => fn(tx));

  /** Ce qu'une personne voit : commandes, lignes et chèques, par identifiant. */
  const visible = (context: AmapContext) =>
    as(context, async (tx) => ({
      orders: (await tx.select({ id: order.id }).from(order)).map((r) => r.id).sort(),
      lines: (await tx.select({ id: orderLine.id }).from(orderLine)).map((r) => r.id).sort(),
      cheques: (
        await tx.select({ household: cheque.householdId, producer: cheque.producerId }).from(cheque)
      )
        .map(
          (r) =>
            `${r.household === ids.martinHome ? "martin" : "dubois"}@${
              r.producer === ids.farmProducer ? "farm" : "bakery"
            }`,
        )
        .sort(),
    }));
  const sorted = (...values: string[]) => [...values].sort();

  /** Tente de changer une quantité : nombre de lignes réellement modifiées. */
  const updateLine = (context: AmapContext, lineId: string) =>
    as(
      context,
      async (tx) =>
        (
          await tx
            .update(orderLine)
            .set({ quantity: 7 })
            .where(eq(orderLine.id, lineId))
            .returning({ id: orderLine.id })
        ).length,
    );
  /** Tente d'ajouter une ligne à une commande. */
  const insertLine = (context: AmapContext, orderId: string, itemId = ids.eggs) =>
    as(context, (tx) =>
      tx.insert(orderLine).values({
        amapId: amapA.id,
        orderId,
        catalogItemId: itemId,
        distributionId: ids.day,
        quantity: 1,
        unitPriceCents: 300,
      }),
    );
  /** Tente de pointer un chèque : nombre de chèques modifiés. */
  const receiveCheque = (context: AmapContext, householdId: string, producerId: string) =>
    as(
      context,
      async (tx) =>
        (
          await tx
            .update(cheque)
            .set({ status: "received" })
            .where(eq(cheque.householdId, householdId))
            .returning({ id: cheque.id, producerId: cheque.producerId })
        ).filter((r) => r.producerId === producerId).length,
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    martin = await f.createUser();
    dubois = await f.createUser();
    formerMember = await f.createUser();
    farmReferent = await f.createUser();
    bakeryReferent = await f.createUser();
    admin = await f.createUser();
    farmer = await f.createUser();
    await f.grantRole(amapA.id, farmReferent.id, "referent");
    await f.grantRole(amapA.id, bakeryReferent.id, "referent");
    await f.grantRole(amapA.id, admin.id, "admin");

    await db.owner.insert(household).values([
      { id: ids.martinHome, amapId: amapA.id, name: "Foyer Martin" },
      { id: ids.duboisHome, amapId: amapA.id, name: "Foyer Dubois" },
    ]);
    await db.owner.insert(householdMember).values([
      { amapId: amapA.id, householdId: ids.martinHome, userId: martin.id, isPrimary: true },
      { amapId: amapA.id, householdId: ids.duboisHome, userId: dubois.id, isPrimary: true },
      {
        amapId: amapA.id,
        householdId: ids.martinHome,
        userId: formerMember.id,
        archivedAt: new Date(),
      },
    ]);

    await db.owner.insert(producer).values([
      { id: ids.farmProducer, name: "Ferme d'essai" },
      { id: ids.bakeryProducer, name: "Fournil d'essai" },
    ]);
    const [farm, bakery] = [uuidv7(), uuidv7()];
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId: ids.farmProducer },
      { id: bakery, amapId: amapA.id, producerId: ids.bakeryProducer },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: farmReferent.id },
      { amapId: amapA.id, amapProducerId: bakery, userId: bakeryReferent.id },
    ]);
    await db.owner.insert(producerUser).values({ producerId: ids.farmProducer, userId: farmer.id });

    await db.owner.insert(orderPeriod).values({
      id: ids.period,
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-10", "2026-11-25"),
      status: "open",
    });
    await db.owner.insert(distribution).values({
      id: ids.day,
      amapId: amapA.id,
      date: "2026-12-03",
      startTime: "18:00",
      endTime: "19:30",
    });
    const [eggsProduct, breadProduct, farmCatalog, bakeryCatalog] = [
      uuidv7(),
      uuidv7(),
      uuidv7(),
      uuidv7(),
    ];
    await db.owner.insert(product).values([
      { id: eggsProduct, producerId: ids.farmProducer, name: "Œufs" },
      { id: breadProduct, producerId: ids.bakeryProducer, name: "Pain" },
    ]);
    await db.owner.insert(catalog).values([
      {
        id: farmCatalog,
        amapId: amapA.id,
        producerId: ids.farmProducer,
        month: "2026-12-01",
        status: "published",
      },
      {
        id: bakeryCatalog,
        amapId: amapA.id,
        producerId: ids.bakeryProducer,
        month: "2026-12-01",
        status: "published",
      },
    ]);
    await db.owner.insert(catalogItem).values([
      {
        id: ids.eggs,
        amapId: amapA.id,
        catalogId: farmCatalog,
        productId: eggsProduct,
        priceCents: 300,
      },
      {
        id: ids.bread,
        amapId: amapA.id,
        catalogId: bakeryCatalog,
        productId: breadProduct,
        priceCents: 450,
      },
    ]);
    await db.owner.insert(order).values([
      { id: ids.martinFarm, amapId: amapA.id, householdId: ids.martinHome, catalogId: farmCatalog },
      { id: ids.duboisFarm, amapId: amapA.id, householdId: ids.duboisHome, catalogId: farmCatalog },
      {
        id: ids.martinBakery,
        amapId: amapA.id,
        householdId: ids.martinHome,
        catalogId: bakeryCatalog,
      },
    ]);
    const line = (id: string, orderId: string, catalogItemId: string, unitPriceCents: number) => ({
      id,
      amapId: amapA.id,
      orderId,
      catalogItemId,
      distributionId: ids.day,
      quantity: 2,
      unitPriceCents,
    });
    await db.owner
      .insert(orderLine)
      .values([
        line(ids.martinFarmLine, ids.martinFarm, ids.eggs, 300),
        line(ids.duboisFarmLine, ids.duboisFarm, ids.eggs, 300),
        line(ids.martinBakeryLine, ids.martinBakery, ids.bread, 450),
      ]);
    const chequeRow = (householdId: string, producerId: string, cents: number) => ({
      amapId: amapA.id,
      householdId,
      producerId,
      orderPeriodId: ids.period,
      grossCents: cents,
      expectedCents: cents,
    });
    await db.owner
      .insert(cheque)
      .values([
        chequeRow(ids.martinHome, ids.farmProducer, 600),
        chequeRow(ids.duboisHome, ids.farmProducer, 600),
        chequeRow(ids.martinHome, ids.bakeryProducer, 900),
      ]);
  });

  it("une famille ne voit que les commandes, lignes et chèques de son foyer", async () => {
    expect(await visible(ctx(martin.id))).toEqual({
      orders: sorted(ids.martinFarm, ids.martinBakery),
      lines: sorted(ids.martinFarmLine, ids.martinBakeryLine),
      cheques: ["martin@bakery", "martin@farm"],
    });
    expect(await visible(ctx(dubois.id))).toEqual({
      orders: [ids.duboisFarm],
      lines: [ids.duboisFarmLine],
      cheques: ["dubois@farm"],
    });
    // Un ancien membre (archivé) ne voit plus rien du foyer.
    expect(await visible(ctx(formerMember.id))).toEqual({ orders: [], lines: [], cheques: [] });
  });

  it("une famille n'écrit que dans sa commande, et jamais dans un chèque", async () => {
    expect(await updateLine(ctx(martin.id), ids.martinFarmLine)).toBe(1);
    expect(await updateLine(ctx(martin.id), ids.duboisFarmLine)).toBe(0);
    await expect(insertLine(ctx(martin.id), ids.duboisFarm)).rejects.toThrow();
    expect(await receiveCheque(ctx(martin.id), ids.martinHome, ids.farmProducer)).toBe(0);
  });

  it("un référent voit et corrige les commandes de ses producteurs seulement", async () => {
    expect(await visible(ctx(farmReferent.id))).toEqual({
      orders: sorted(ids.martinFarm, ids.duboisFarm),
      lines: sorted(ids.martinFarmLine, ids.duboisFarmLine),
      cheques: ["dubois@farm", "martin@farm"],
    });
    expect(await updateLine(ctx(farmReferent.id), ids.duboisFarmLine)).toBe(1);
    expect(await updateLine(ctx(bakeryReferent.id), ids.duboisFarmLine)).toBe(0);
    await expect(insertLine(ctx(bakeryReferent.id), ids.duboisFarm)).rejects.toThrow();
    // Pointage (F1) : le référent du producteur, pas celui d'un autre.
    expect(await receiveCheque(ctx(bakeryReferent.id), ids.duboisHome, ids.farmProducer)).toBe(0);
    expect(await receiveCheque(ctx(farmReferent.id), ids.duboisHome, ids.farmProducer)).toBe(1);
  });

  it("un admin voit et corrige tout dans son AMAP, rien dans une autre", async () => {
    expect(await visible(ctx(admin.id))).toEqual({
      orders: sorted(ids.martinFarm, ids.duboisFarm, ids.martinBakery),
      lines: sorted(ids.martinFarmLine, ids.duboisFarmLine, ids.martinBakeryLine),
      cheques: ["dubois@farm", "martin@bakery", "martin@farm"],
    });
    expect(await updateLine(ctx(admin.id), ids.martinBakeryLine)).toBe(1);
    expect(await visible(ctx(admin.id, undefined, amapB.id))).toEqual({
      orders: [],
      lines: [],
      cheques: [],
    });
  });

  it("le compte du producteur lit ses commandes, sans pouvoir les modifier", async () => {
    expect(await visible(ctx(farmer.id))).toEqual({
      orders: sorted(ids.martinFarm, ids.duboisFarm),
      lines: sorted(ids.martinFarmLine, ids.duboisFarmLine),
      cheques: ["dubois@farm", "martin@farm"],
    });
    expect(await updateLine(ctx(farmer.id), ids.martinFarmLine)).toBe(0);
    await expect(insertLine(ctx(farmer.id), ids.martinFarm)).rejects.toThrow();
    expect(await receiveCheque(ctx(farmer.id), ids.martinHome, ids.farmProducer)).toBe(0);
  });

  it("un visiteur anonyme ne voit ni n'écrit rien", async () => {
    expect(await visible(ctx(null))).toEqual({ orders: [], lines: [], cheques: [] });
    expect(await updateLine(ctx(null), ids.martinFarmLine)).toBe(0);
    await expect(insertLine(ctx(null), ids.martinFarm)).rejects.toThrow();
  });

  it("le lien signé lit tout dans l'AMAP, sans rien modifier", async () => {
    const link = ctx(null, "order_form_link");
    expect((await visible(link)).lines).toHaveLength(3);
    expect(await updateLine(link, ids.martinFarmLine)).toBe(0);
    expect(await receiveCheque(link, ids.martinHome, ids.farmProducer)).toBe(0);
    // Dans une autre AMAP : rien.
    expect(await visible(ctx(null, "order_form_link", amapB.id))).toEqual({
      orders: [],
      lines: [],
      cheques: [],
    });
  });

  it("la tâche horaire de clôture lit les commandes et écrit les chèques", async () => {
    const job = ctx(null, "closing_job");
    expect((await visible(job)).orders).toHaveLength(3);
    expect(await receiveCheque(job, ids.martinHome, ids.bakeryProducer)).toBe(1);
    // Mais elle ne touche pas aux commandes elles-mêmes.
    expect(await updateLine(job, ids.martinFarmLine)).toBe(0);
  });
});
