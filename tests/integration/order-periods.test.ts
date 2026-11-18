import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  auditLog,
  catalog,
  catalogItem,
  cheque,
  credit,
  distribution,
  household,
  householdMember,
  order,
  orderLine,
  orderPeriod,
  producer,
  product,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError, UnauthenticatedError } from "@/server/auth/errors";
import {
  closeOrderPeriod,
  getDashboardOrderPeriod,
  planReminders,
  reopenOrderPeriod,
  runOrderPeriodTransitions,
  saveOrderPeriodDates,
} from "@/server/order-periods";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Période de commande (story D2), avec la vraie base et la RLS. Dates fixes : commandes de
// décembre 2026, ouvertes du 15 au 25 novembre (heure de Paris).
const BEFORE = new Date("2026-11-10T10:00:00Z");
const DURING = new Date("2026-11-20T10:00:00Z");
const AFTER = new Date("2026-11-26T10:00:00Z");
const LATER = new Date("2026-11-28T10:00:00Z");

describe("Période de commande (D2)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let adminB: { id: string };
  const households: string[] = [];
  const members: Array<{ id: string; email: string }> = [];
  let farm: string; // producteur
  let dairy: string;
  let periodId: string;

  const as = (userId: string | null, amapId: string): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor: string | null = admin.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);
  const setDates = (opensOn: string, closesOn: string, now = BEFORE, actor = admin.id) =>
    inA(
      (tx, ctx) => saveOrderPeriodDates(tx, ctx, { month: "2026-12", opensOn, closesOn }, now),
      actor,
    );
  const chequesOfPeriod = () =>
    db.owner.select().from(cheque).where(eq(cheque.orderPeriodId, periodId));

  /** Catalogue de décembre d'un producteur, avec un produit au prix donné. */
  const catalogWith = async (producerId: string, priceCents: number) => {
    const catalogId = uuidv7();
    const productId = uuidv7();
    const itemId = uuidv7();
    await db.owner
      .insert(product)
      .values({ id: productId, producerId, name: `Produit ${priceCents}` });
    await db.owner
      .insert(catalog)
      .values({ id: catalogId, amapId: amapA.id, producerId, month: "2026-12-01" });
    await db.owner
      .insert(catalogItem)
      .values({ id: itemId, amapId: amapA.id, catalogId, productId, priceCents });
    return { catalogId, itemId };
  };

  /** Commande d'un foyer : `quantity` produits à la distribution donnée, au prix donné. */
  const orderOf = async (
    householdId: string,
    target: { catalogId: string; itemId: string },
    distributionId: string,
    quantity: number,
    unitPriceCents: number,
  ) => {
    const orderId = uuidv7();
    await db.owner
      .insert(order)
      .values({ id: orderId, amapId: amapA.id, householdId, catalogId: target.catalogId });
    await db.owner.insert(orderLine).values({
      amapId: amapA.id,
      orderId,
      catalogItemId: target.itemId,
      distributionId,
      quantity,
      unitPriceCents,
    });
    return orderId;
  };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    referent = await f.createUser();
    adminB = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapB.id, adminB.id, "admin");

    // Quatre foyers d'un membre chacun ; le quatrième est archivé.
    for (const name of ["Foyer A", "Foyer B", "Foyer C", "Foyer D"]) {
      const id = uuidv7();
      households.push(id);
      await db.owner.insert(household).values({
        id,
        amapId: amapA.id,
        name,
        archivedAt: name === "Foyer D" ? new Date() : null,
      });
      const member = await f.createUser();
      members.push(member);
      await db.owner
        .insert(householdMember)
        .values({ amapId: amapA.id, householdId: id, userId: member.id, isPrimary: true });
    }

    farm = uuidv7();
    dairy = uuidv7();
    await db.owner.insert(producer).values([
      { id: farm, name: "Ferme d'essai" },
      { id: dairy, name: "Laiterie d'essai" },
    ]);
    await db.owner.insert(amapProducer).values([
      { amapId: amapA.id, producerId: farm },
      { amapId: amapA.id, producerId: dairy },
    ]);
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  it("propose du 15 au 25 du mois d'avant tant que les dates ne sont pas fixées", async () => {
    const view = await inA((tx, ctx) => getDashboardOrderPeriod(tx, ctx, BEFORE));
    expect(view).toMatchObject({
      month: "2026-12",
      id: null,
      status: "none",
      opensOn: "2026-11-15",
      closesOn: "2026-11-25",
      orderedHouseholds: 0,
      activeHouseholds: 3,
    });
  });

  it("refuse les dates à un non-admin et à un visiteur", async () => {
    await expect(setDates("2026-11-15", "2026-11-25", BEFORE, referent.id)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      withAmapContext(db.app, as(null, amapA.id), (tx, ctx) =>
        saveOrderPeriodDates(tx, ctx, { month: "2026-12", opensOn: "", closesOn: "" }, BEFORE),
      ),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("refuse une clôture avant l'ouverture ou déjà passée", async () => {
    expect(await setDates("2026-11-20", "2026-11-18")).toEqual({
      status: "invalid",
      errors: ["before_opening"],
    });
    expect(await setDates("2026-11-01", "2026-11-05")).toEqual({
      status: "invalid",
      errors: ["past"],
    });
  });

  it("crée la période, prévue, et l'inscrit au journal", async () => {
    expect(await setDates("2026-11-16", "2026-11-24")).toEqual({
      status: "saved",
      period: "scheduled",
    });
    expect(await setDates("2026-11-15", "2026-11-25")).toEqual({
      status: "saved",
      period: "scheduled",
    });
    const [period] = await db.owner.select().from(orderPeriod);
    periodId = period!.id;
    expect(period).toMatchObject({
      month: "2026-12-01",
      status: "scheduled",
      opensAt: new Date("2026-11-14T23:00:00Z"),
      closesAt: new Date("2026-11-25T23:00:00Z"),
    });
    const logs = await db.owner
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, periodId));
    expect(logs.map((l) => l.action).sort()).toEqual(["create", "update_dates"]);
  });

  it("ouvre la période à l'heure, par la tâche planifiée", async () => {
    expect(await runOrderPeriodTransitions(db.app, BEFORE)).toEqual([]);
    expect(await runOrderPeriodTransitions(db.app, DURING)).toEqual([
      { amapId: amapA.id, month: "2026-12", action: "open" },
    ]);
    const [period] = await db.owner.select().from(orderPeriod).where(eq(orderPeriod.id, periodId));
    expect(period?.status).toBe("open");
    // Deuxième passage : rien à faire.
    expect(await runOrderPeriodTransitions(db.app, DURING)).toEqual([]);
  });

  it("une fois ouverte, ne change que le jour de clôture", async () => {
    expect(await setDates("2026-11-01", "2026-11-27", DURING)).toEqual({
      status: "saved",
      period: "open",
    });
    const view = await inA((tx, ctx) => getDashboardOrderPeriod(tx, ctx, DURING));
    expect(view).toMatchObject({ status: "open", opensOn: "2026-11-15", closesOn: "2026-11-27" });
    await setDates("2026-11-15", "2026-11-25", DURING);
  });

  it("relance seulement les membres des foyers actifs sans commande", async () => {
    const thursday = uuidv7();
    await db.owner.insert(distribution).values({
      id: thursday,
      amapId: amapA.id,
      date: "2026-12-03",
      startTime: "18:00",
      endTime: "19:30",
    });
    const bread = await catalogWith(farm, 450);
    const milk = await catalogWith(dairy, 300);
    // Foyer A : 2 × 4,50 € à la ferme et 3 × 3,00 € à la laiterie ; foyer B : 1 × 4,50 € à la
    // ferme ; foyer C : une ligne à zéro (n'a rien commandé).
    await orderOf(households[0]!, bread, thursday, 2, 450);
    await orderOf(households[0]!, milk, thursday, 3, 300);
    await orderOf(households[1]!, bread, thursday, 1, 450);
    await orderOf(households[2]!, milk, thursday, 0, 300);
    // Avoirs en attente : 5 € puis 2 € pour le foyer A à la ferme (plus que sa commande de 9 €
    // une fois ajoutés à un troisième de 4 €) ; aucun pour la laiterie.
    await db.owner.insert(credit).values([
      {
        id: uuidv7(),
        amapId: amapA.id,
        householdId: households[0]!,
        producerId: farm,
        amountCents: 500,
      },
      {
        id: uuidv7(),
        amapId: amapA.id,
        householdId: households[0]!,
        producerId: farm,
        amountCents: 200,
      },
      {
        id: uuidv7(),
        amapId: amapA.id,
        householdId: households[0]!,
        producerId: farm,
        amountCents: 400,
      },
    ]);

    const plan = await inA((tx, ctx) => planReminders(tx, ctx, { periodId }, DURING));
    expect(plan).toMatchObject({ status: "ready", month: "2026-12", closesOn: "2026-11-25" });
    expect(plan.status === "ready" && plan.recipients.map((r) => r.userId)).toEqual([
      members[2]!.id,
    ]);

    const view = await inA((tx, ctx) => getDashboardOrderPeriod(tx, ctx, DURING));
    expect(view).toMatchObject({ orderedHouseholds: 2, activeHouseholds: 3 });

    await expect(
      inA((tx, ctx) => planReminders(tx, ctx, { periodId }, DURING), referent.id),
    ).rejects.toThrow(ForbiddenError);
  });

  it("clôture par la tâche planifiée : un chèque par foyer et producteur, avoirs déduits", async () => {
    expect(await runOrderPeriodTransitions(db.app, AFTER)).toEqual([
      { amapId: amapA.id, month: "2026-12", action: "close" },
    ]);
    const cheques = await chequesOfPeriod();
    const of = (h: number, p: string) =>
      cheques.find((c) => c.householdId === households[h] && c.producerId === p);
    // Foyer A, ferme : 9,00 € − (5,00 + 2,00 + 2,00 sur l'avoir de 4,00) = 0.
    expect(of(0, farm)).toMatchObject({ grossCents: 900, creditsCents: 900, expectedCents: 0 });
    expect(of(0, dairy)).toMatchObject({ grossCents: 900, creditsCents: 0, expectedCents: 900 });
    expect(of(1, farm)).toMatchObject({ grossCents: 450, creditsCents: 0, expectedCents: 450 });
    expect(cheques).toHaveLength(3);

    // Le reste de l'avoir de 4,00 € (2,00 €) attend la commande suivante.
    const credits = await db.owner.select().from(credit).where(eq(credit.producerId, farm));
    expect(credits.filter((c) => c.status === "created").map((c) => c.amountCents)).toEqual([200]);
    expect(
      credits.filter((c) => c.status === "deducted").reduce((s, c) => s + c.amountCents, 0),
    ).toBe(900);

    const [log] = await db.owner
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, periodId), eq(auditLog.action, "close")));
    expect(log).toMatchObject({ actorUserId: null });
    expect(log?.after).toMatchObject({ automatic: true, cheques: 3, totalCents: 1350 });

    // Deuxième passage : déjà clôturée, rien ne change.
    expect(await runOrderPeriodTransitions(db.app, AFTER)).toEqual([]);
    const view = await inA((tx, ctx) => getDashboardOrderPeriod(tx, ctx, LATER));
    expect(view).toMatchObject({ month: "2026-12", status: "closed", closedOn: "2026-11-25" });
  });

  it("rouvre jusqu'à un nouveau jour, puis recalcule les chèques non pointés", async () => {
    expect(
      await inA((tx, ctx) =>
        reopenOrderPeriod(tx, ctx, { periodId, closesOn: "2026-11-26" }, LATER),
      ),
    ).toEqual({ status: "invalid", errors: ["past"] });
    await expect(
      inA(
        (tx, ctx) => reopenOrderPeriod(tx, ctx, { periodId, closesOn: "2026-11-30" }, LATER),
        referent.id,
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(
      await inA((tx, ctx) =>
        reopenOrderPeriod(tx, ctx, { periodId, closesOn: "2026-11-30" }, LATER),
      ),
    ).toEqual({ status: "reopened" });
    const view = await inA((tx, ctx) => getDashboardOrderPeriod(tx, ctx, LATER));
    expect(view).toMatchObject({
      month: "2026-12",
      status: "open",
      reopened: true,
      closesOn: "2026-11-30",
    });

    // Le chèque du foyer B est pointé : il ne bouge plus. Le foyer A ne commande plus rien à
    // la laiterie : ce chèque est archivé. Le foyer A commande un pain de plus à la ferme.
    const cheques = await chequesOfPeriod();
    const chequeB = cheques.find((c) => c.householdId === households[1])!;
    await db.owner
      .update(cheque)
      .set({ status: "received", receivedCents: 450, receivedAt: LATER })
      .where(eq(cheque.id, chequeB.id));
    await db.owner.update(orderLine).set({ quantity: 0 }).where(eq(orderLine.unitPriceCents, 300));
    await db.owner
      .update(orderLine)
      .set({ quantity: 3 })
      .where(and(eq(orderLine.unitPriceCents, 450), eq(orderLine.quantity, 2)));
    await db.owner.update(orderLine).set({ quantity: 5 }).where(eq(orderLine.quantity, 1));

    expect(await inA((tx, ctx) => closeOrderPeriod(tx, ctx, { periodId }, LATER))).toEqual({
      status: "closed",
      cheques: 1,
    });

    const after = await chequesOfPeriod();
    const of = (h: number, p: string) =>
      after.find((c) => c.householdId === households[h] && c.producerId === p);
    // Foyer A, ferme : 13,50 € − 11,00 € d'avoirs (les 9,00 € détachés puis le reste de 2,00 €).
    expect(of(0, farm)).toMatchObject({ grossCents: 1350, creditsCents: 1100, expectedCents: 250 });
    expect(of(0, dairy)?.archivedAt).not.toBeNull();
    // Le chèque pointé n'a pas été recalculé, malgré la nouvelle quantité.
    expect(of(1, farm)).toMatchObject({ status: "received", grossCents: 450, expectedCents: 450 });
    const pending = await db.owner
      .select()
      .from(credit)
      .where(and(eq(credit.producerId, farm), eq(credit.status, "created")));
    expect(pending).toEqual([]);
  });

  it("refuse de clôturer une période déjà clôturée", async () => {
    expect(await inA((tx, ctx) => closeOrderPeriod(tx, ctx, { periodId }, LATER))).toEqual({
      status: "not_open",
    });
  });

  it("isole les AMAP : périodes et chèques de l'AMAP A invisibles depuis l'AMAP B", async () => {
    const seen = await withAmapContext(db.app, as(adminB.id, amapB.id), async (tx) => ({
      periods: await tx.select().from(orderPeriod),
      cheques: await tx.select().from(cheque),
      credits: await tx.select().from(credit),
      orders: await tx.select().from(order),
      lines: await tx.select().from(orderLine),
    }));
    expect(seen).toEqual({ periods: [], cheques: [], credits: [], orders: [], lines: [] });
    const view = await withAmapContext(db.app, as(adminB.id, amapB.id), (tx, ctx) =>
      getDashboardOrderPeriod(tx, ctx, DURING),
    );
    expect(view).toMatchObject({ status: "none", activeHouseholds: 0 });
  });
});
