import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  catalogItemAvailability,
  cheque,
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
import {
  getFamilyOrder,
  planOrderConfirmation,
  setNothingThisMonth,
  setOrderQuantities,
  setOrderQuantity,
} from "@/server/orders";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Commandes de décembre 2026, ouvertes du 10 novembre au 20 décembre (une réouverture tardive,
// pour avoir des distributions passées pendant la période).
const NOW = new Date("2026-11-18T10:00:00Z");
const LATER = new Date("2026-12-08T10:00:00Z"); // après la distribution du 3 décembre

// Saisie de la commande du mois (story D3), avec la vraie base et la RLS.
describe("Commande du mois (D3)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let family: { id: string }; // membre du foyer qui commande
  let neighbour: { id: string }; // membre d'un autre foyer
  let stranger: { id: string }; // sans foyer dans l'AMAP
  let homeId: string;
  let neighbourHomeId: string;
  let periodId: string;
  let producerId: string;
  let catalogId: string;
  let draftCatalogId: string;
  let eggs: string; // produit disponible les 3 et 10 décembre
  let honey: string; // produit disponible le 10 décembre seulement
  let draftItem: string; // produit d'un catalogue non publié
  let dec3: string;
  let dec10: string;

  const as = (userId: string, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: false,
  });
  const run = <T>(userId: string, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, as(userId), fn);
  const setQuantity = (
    userId: string,
    itemId: string,
    distributionId: string,
    quantity: number,
    now = NOW,
  ) =>
    run(userId, (tx, ctx) =>
      setOrderQuantity(tx, ctx, { catalogItemId: itemId, distributionId, quantity }, now),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    family = await f.createUser();
    neighbour = await f.createUser();
    stranger = await f.createUser();

    homeId = uuidv7();
    neighbourHomeId = uuidv7();
    await db.owner.insert(household).values([
      { id: homeId, amapId: amapA.id, name: "Foyer Essai" },
      { id: neighbourHomeId, amapId: amapA.id, name: "Foyer Voisin" },
    ]);
    await db.owner.insert(householdMember).values([
      { amapId: amapA.id, householdId: homeId, userId: family.id, isPrimary: true },
      { amapId: amapA.id, householdId: neighbourHomeId, userId: neighbour.id, isPrimary: true },
    ]);
    await db.owner.insert(membership).values([
      { amapId: amapA.id, householdId: homeId, startDate: "2026-01-01", endDate: "2026-12-31" },
      // Le voisin n'est plus adhérent.
      {
        amapId: amapA.id,
        householdId: neighbourHomeId,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      },
    ]);

    periodId = uuidv7();
    await db.owner.insert(orderPeriod).values({
      id: periodId,
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-10", "2026-12-20"),
      status: "open",
    });
    [dec3, dec10] = [uuidv7(), uuidv7()];
    const dec17 = uuidv7();
    await db.owner.insert(distribution).values([
      { id: dec3, amapId: amapA.id, date: "2026-12-03", startTime: "18:00", endTime: "19:30" },
      { id: dec10, amapId: amapA.id, date: "2026-12-10", startTime: "18:00", endTime: "19:30" },
      {
        id: dec17,
        amapId: amapA.id,
        date: "2026-12-17",
        startTime: "18:00",
        endTime: "19:30",
        isOpen: false,
        closedReason: "Fermée",
      },
    ]);

    producerId = uuidv7();
    const otherProducerId = uuidv7();
    await db.owner.insert(producer).values([
      { id: producerId, name: "Ferme d'essai", category: "Œufs" },
      { id: otherProducerId, name: "Fournil d'essai" },
    ]);
    await db.owner.insert(amapProducer).values([
      { amapId: amapA.id, producerId, checkPayee: "GAEC d'essai" },
      { amapId: amapA.id, producerId: otherProducerId },
    ]);
    const [p1, p2, p3] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(product).values([
      { id: p1, producerId, name: "Œufs, boîte de 6" },
      { id: p2, producerId, name: "Miel, pot de 500 g" },
      { id: p3, producerId: otherProducerId, name: "Pain de campagne" },
    ]);
    catalogId = uuidv7();
    draftCatalogId = uuidv7();
    await db.owner.insert(catalog).values([
      { id: catalogId, amapId: amapA.id, producerId, month: "2026-12-01", status: "published" },
      {
        id: draftCatalogId,
        amapId: amapA.id,
        producerId: otherProducerId,
        month: "2026-12-01",
        status: "draft",
      },
    ]);
    [eggs, honey, draftItem] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(catalogItem).values([
      { id: eggs, amapId: amapA.id, catalogId, productId: p1, priceCents: 300, position: 0 },
      { id: honey, amapId: amapA.id, catalogId, productId: p2, priceCents: 900, position: 1 },
      {
        id: draftItem,
        amapId: amapA.id,
        catalogId: draftCatalogId,
        productId: p3,
        priceCents: 450,
      },
    ]);
    await db.owner.insert(catalogItemAvailability).values([
      { amapId: amapA.id, catalogItemId: eggs, distributionId: dec3 },
      { amapId: amapA.id, catalogItemId: eggs, distributionId: dec10 },
      { amapId: amapA.id, catalogItemId: honey, distributionId: dec10 },
      { amapId: amapA.id, catalogItemId: draftItem, distributionId: dec10 },
    ]);
  });

  it("montre au foyer les seuls catalogues publiés du mois, case par case", async () => {
    const current = await run(family.id, (tx, ctx) => getFamilyOrder(tx, ctx, NOW));
    if (current.state !== "open") throw new Error(current.state);
    expect(current).toMatchObject({ month: "2026-12", closesOn: "2026-12-20" });
    expect(current.membershipActive).toBe(true);
    expect(current.producers.map((p) => [p.name, p.status, p.checkPayee])).toEqual([
      ["Ferme d'essai", "todo", "GAEC d'essai"],
    ]);
    const [eggRow, honeyRow] = current.producers[0]!.items;
    expect(eggRow!.cells.map((c) => c.lock)).toEqual([null, null, "unavailable"]);
    expect(honeyRow!.cells.map((c) => c.lock)).toEqual(["unavailable", null, "unavailable"]);
  });

  it("enregistre une quantité au prix du catalogue (accès autorisé)", async () => {
    expect(await setQuantity(family.id, eggs, dec3, 2)).toEqual({
      status: "saved",
      quantity: 2,
      unitPriceCents: 300,
    });
    expect(await setQuantity(family.id, honey, dec10, 1)).toMatchObject({ status: "saved" });

    // Un nouveau prix au catalogue ne touche pas la ligne déjà enregistrée.
    await db.owner.update(catalogItem).set({ priceCents: 350 }).where(eq(catalogItem.id, eggs));
    const current = await run(family.id, (tx, ctx) => getFamilyOrder(tx, ctx, NOW));
    if (current.state !== "open") throw new Error(current.state);
    const farm = current.producers[0]!;
    expect(farm.status).toBe("complete");
    expect(farm.totalCents).toBe(2 * 300 + 900);
    expect(farm.items[0]!.cells[0]).toMatchObject({ quantity: 2, unitPriceCents: 300 });
  });

  it("refuse une saisie hors des règles, sans rien enregistrer", async () => {
    // Produit indisponible ce jour-là, distribution fermée, catalogue non publié.
    expect(await setQuantity(family.id, honey, dec3, 1)).toEqual({
      status: "locked",
      reason: "unavailable",
    });
    expect(await setQuantity(family.id, draftItem, dec10, 1)).toEqual({ status: "invalid" });
    // Distribution passée pendant une période encore ouverte.
    expect(await setQuantity(family.id, eggs, dec3, 5, LATER)).toEqual({
      status: "locked",
      reason: "past",
    });
    // Quantité hors limites.
    expect(await setQuantity(family.id, eggs, dec10, 100)).toEqual({ status: "invalid" });
    // Après la clôture.
    expect(await setQuantity(family.id, eggs, dec10, 1, new Date("2026-12-21T10:00:00Z"))).toEqual({
      status: "closed",
    });

    const lines = await db.owner.select().from(orderLine);
    expect(lines.map((l) => l.quantity).sort()).toEqual([1, 2]);
  });

  it("refuse la commande d'un foyer sans adhésion en cours, ou d'un compte sans foyer (accès refusé)", async () => {
    expect(await setQuantity(neighbour.id, eggs, dec10, 1)).toEqual({ status: "membership" });
    expect(await setQuantity(stranger.id, eggs, dec10, 1)).toEqual({ status: "no_household" });
    const current = await run(neighbour.id, (tx, ctx) => getFamilyOrder(tx, ctx, NOW));
    expect(current).toMatchObject({ state: "open", membershipActive: false });
    // Le voisin ne voit pas la commande du foyer Essai : son statut reste « à compléter ».
    if (current.state === "open") expect(current.producers[0]!.status).toBe("todo");
  });

  it("fige la commande chez un producteur dont le chèque est pointé", async () => {
    const chequeId = uuidv7();
    await db.owner.insert(cheque).values({
      id: chequeId,
      amapId: amapA.id,
      householdId: homeId,
      producerId,
      orderPeriodId: periodId,
      grossCents: 1500,
      expectedCents: 1500,
      status: "received",
      receivedCents: 1500,
    });
    try {
      expect(await setQuantity(family.id, eggs, dec10, 3)).toEqual({
        status: "locked",
        reason: "cheque_received",
      });
    } finally {
      await db.owner.delete(cheque).where(eq(cheque.id, chequeId));
    }
  });

  it("retire une ligne remise à zéro, puis note « rien ce mois-ci » sur choix du foyer", async () => {
    // Des quantités restent : « rien ce mois-ci » est refusé.
    const decline = (nothing: boolean) =>
      run(family.id, (tx, ctx) => setNothingThisMonth(tx, ctx, { catalogId, nothing }, NOW));
    expect(await decline(true)).toEqual({ status: "has_quantities" });

    await setQuantity(family.id, eggs, dec3, 0);
    await setQuantity(family.id, honey, dec10, 0);
    expect(await db.owner.select().from(orderLine)).toEqual([]);
    let current = await run(family.id, (tx, ctx) => getFamilyOrder(tx, ctx, NOW));
    if (current.state !== "open") throw new Error(current.state);
    // Tout à zéro ne vaut pas « rien ce mois-ci » : il faut le choisir.
    expect(current.producers[0]!.status).toBe("todo");

    expect(await decline(true)).toEqual({ status: "saved" });
    current = await run(family.id, (tx, ctx) => getFamilyOrder(tx, ctx, NOW));
    if (current.state !== "open") throw new Error(current.state);
    expect(current.producers[0]!.status).toBe("nothing");

    // Une quantité saisie l'annule.
    await setQuantity(family.id, eggs, dec10, 1);
    const [row] = await db.owner.select().from(order).where(eq(order.householdId, homeId));
    expect(row?.declinedAt).toBeNull();
  });

  it("prépare la validation : un chèque par producteur commandé", async () => {
    expect(await run(family.id, (tx, ctx) => planOrderConfirmation(tx, ctx, NOW))).toEqual({
      status: "ready",
      periodId,
      month: "2026-12",
      closesOn: "2026-12-20",
      producers: [{ name: "Ferme d'essai", checkPayee: "GAEC d'essai", totalCents: 350 }],
      totalCents: 350,
    });
    expect(await run(neighbour.id, (tx, ctx) => planOrderConfirmation(tx, ctx, NOW))).toEqual({
      status: "empty",
    });
  });

  it("enregistre plusieurs semaines d'un coup, case par case", async () => {
    const results = await run(family.id, (tx, ctx) =>
      setOrderQuantities(
        tx,
        ctx,
        {
          lines: [
            { catalogItemId: eggs, distributionId: dec3, quantity: 4 },
            { catalogItemId: honey, distributionId: dec3, quantity: 4 },
          ],
        },
        NOW,
      ),
    );
    expect(results).toEqual([
      { status: "saved", quantity: 4, unitPriceCents: 350 },
      { status: "locked", reason: "unavailable" },
    ]);
    expect(
      await run(family.id, (tx, ctx) => setOrderQuantities(tx, ctx, { lines: [] }, NOW)),
    ).toEqual({ status: "invalid" });
    await setQuantity(family.id, eggs, dec3, 0);
  });

  it("isole les AMAP : aucune commande visible depuis une autre AMAP", async () => {
    const seen = await withAmapContext(db.app, as(family.id, amapB.id), (tx) =>
      tx.select().from(order),
    );
    expect(seen).toEqual([]);
    expect(
      await withAmapContext(db.app, as(family.id, amapB.id), (tx, ctx) =>
        getFamilyOrder(tx, ctx, NOW),
      ),
    ).toEqual({ state: "no_household" });
  });
});
