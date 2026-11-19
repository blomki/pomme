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
  membership,
  orderPeriod,
  producer,
  product,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { hasOpenGap, pointageProgress } from "@/domain/cheques";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import {
  defaultChequeMonth,
  getChequePointage,
  markChequeReceived,
  settleChequeGap,
  unmarkChequeReceived,
} from "@/server/cheques";
import { reopenOrderPeriod } from "@/server/order-periods";
import { setOrderQuantity } from "@/server/orders";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Commandes de décembre 2026, clôturées le 25 novembre ; nous sommes le 28.
const NOW = new Date("2026-11-28T10:00:00Z");

// Pointage des chèques (story F1), avec la vraie base et la RLS.
describe("Pointage des chèques (F1)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let referent: { id: string }; // suit la ferme
  let otherReferent: { id: string }; // suit le fournil
  let admin: { id: string };
  let family: { id: string }; // membre du foyer Martin
  let farm: string; // amap_producer de la ferme
  let periodId: string;
  let farmProducerId: string;
  let martinFarm: string; // chèque de Martin à la ferme
  let duboisFarm: string;
  let martinBakery: string;
  let eggs: string;
  let bread: string;
  let dec10: string;

  const as = (userId: string, secondFactorVerified = false): AmapContext => ({
    amapId: amapA.id,
    userId,
    secondFactorVerified,
  });
  const run = <T>(ctx: AmapContext, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, ctx, fn);
  const mark = (ctx: AmapContext, input: object) =>
    run(ctx, (tx, c) => markChequeReceived(tx, c, input, NOW));
  const journal = (chequeId: string) =>
    db.owner
      .select({ action: auditLog.action, actor: auditLog.actorUserId, after: auditLog.after })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "cheque"), eq(auditLog.entityId, chequeId)))
      .orderBy(auditLog.createdAt);

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    referent = await f.createUser();
    otherReferent = await f.createUser();
    admin = await f.createUser();
    family = await f.createUser();
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");
    await f.grantRole(amapA.id, admin.id, "admin");

    const [martin, dubois] = [uuidv7(), uuidv7()];
    await db.owner.insert(household).values([
      { id: martin, amapId: amapA.id, name: "Foyer Martin" },
      { id: dubois, amapId: amapA.id, name: "Foyer Dubois" },
    ]);
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: martin, userId: family.id, isPrimary: true });
    await db.owner.insert(membership).values({
      amapId: amapA.id,
      householdId: martin,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });

    farmProducerId = uuidv7();
    const bakeryProducerId = uuidv7();
    await db.owner.insert(producer).values([
      { id: farmProducerId, name: "Ferme d'essai" },
      { id: bakeryProducerId, name: "Fournil d'essai" },
    ]);
    farm = uuidv7();
    const bakery = uuidv7();
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId: farmProducerId },
      { id: bakery, amapId: amapA.id, producerId: bakeryProducerId },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: referent.id },
      { amapId: amapA.id, amapProducerId: bakery, userId: otherReferent.id },
    ]);

    periodId = uuidv7();
    await db.owner.insert(orderPeriod).values({
      id: periodId,
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-10", "2026-11-25"),
      status: "closed",
      closedAt: new Date("2026-11-25T23:00:00Z"),
    });
    dec10 = uuidv7();
    await db.owner.insert(distribution).values({
      id: dec10,
      amapId: amapA.id,
      date: "2026-12-10",
      startTime: "18:00",
      endTime: "19:30",
    });
    const [p1, p2, c1, c2] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(product).values([
      { id: p1, producerId: farmProducerId, name: "Œufs" },
      { id: p2, producerId: bakeryProducerId, name: "Pain" },
    ]);
    await db.owner.insert(catalog).values([
      {
        id: c1,
        amapId: amapA.id,
        producerId: farmProducerId,
        month: "2026-12-01",
        status: "published",
      },
      {
        id: c2,
        amapId: amapA.id,
        producerId: bakeryProducerId,
        month: "2026-12-01",
        status: "published",
      },
    ]);
    [eggs, bread] = [uuidv7(), uuidv7()];
    await db.owner.insert(catalogItem).values([
      { id: eggs, amapId: amapA.id, catalogId: c1, productId: p1, priceCents: 300 },
      { id: bread, amapId: amapA.id, catalogId: c2, productId: p2, priceCents: 450 },
    ]);
    await db.owner.insert(catalogItemAvailability).values([
      { amapId: amapA.id, catalogItemId: eggs, distributionId: dec10 },
      { amapId: amapA.id, catalogItemId: bread, distributionId: dec10 },
    ]);

    [martinFarm, duboisFarm, martinBakery] = [uuidv7(), uuidv7(), uuidv7()];
    const row = (id: string, householdId: string, producerId: string, cents: number) => ({
      id,
      amapId: amapA.id,
      householdId,
      producerId,
      orderPeriodId: periodId,
      grossCents: cents,
      expectedCents: cents,
    });
    await db.owner
      .insert(cheque)
      .values([
        row(martinFarm, martin, farmProducerId, 1200),
        row(duboisFarm, dubois, farmProducerId, 900),
        row(martinBakery, martin, bakeryProducerId, 450),
      ]);
  });

  it("le référent voit les chèques de son producteur, par foyer (accès autorisé)", async () => {
    const view = await run(as(referent.id), (tx, c) =>
      getChequePointage(tx, c, { amapProducerId: farm, month: "2026-12" }),
    );
    expect(view).toMatchObject({ producerName: "Ferme d'essai", periodStatus: "closed" });
    expect(view.cheques.map((c) => [c.householdName, c.expectedCents, c.status])).toEqual([
      ["Foyer Dubois", 900, "expected"],
      ["Foyer Martin", 1200, "expected"],
    ]);
    expect(pointageProgress(view.cheques)).toEqual({ treated: 0, total: 2 });
    expect(await run(as(referent.id), (tx) => defaultChequeMonth(tx, NOW))).toBe("2026-12");
  });

  it("coche « Reçu » au montant attendu, signale un écart jusqu'à son traitement, et journalise", async () => {
    expect(await mark(as(referent.id), { chequeId: duboisFarm })).toMatchObject({
      status: "saved",
      cheque: { status: "received", receivedCents: 900, chequeNumber: null },
    });

    // Montant corrigé : écart de −2 €, avec le numéro.
    const short = await mark(as(referent.id), {
      chequeId: martinFarm,
      receivedCents: 1000,
      chequeNumber: " 1234  567 ",
    });
    if (short.status !== "saved") throw new Error(short.status);
    expect(short.cheque).toMatchObject({ receivedCents: 1000, chequeNumber: "1234 567" });
    expect(hasOpenGap(short.cheque)).toBe(true);

    const settled = await run(as(referent.id), (tx, c) =>
      settleChequeGap(tx, c, { chequeId: martinFarm, settled: true }, NOW),
    );
    if (settled.status !== "saved") throw new Error(settled.status);
    expect(hasOpenGap(settled.cheque)).toBe(false);
    // Un nouveau montant rouvre l'écart.
    const again = await mark(as(referent.id), { chequeId: martinFarm, receivedCents: 1100 });
    if (again.status !== "saved") throw new Error(again.status);
    expect(hasOpenGap(again.cheque)).toBe(true);
    // Pas d'écart à traiter sur un chèque juste.
    expect(
      await run(as(referent.id), (tx, c) =>
        settleChequeGap(tx, c, { chequeId: duboisFarm, settled: true }, NOW),
      ),
    ).toEqual({ status: "no_gap" });

    expect((await journal(martinFarm)).map((e) => [e.action, e.actor])).toEqual([
      ["mark_received", referent.id],
      ["settle_gap", referent.id],
      ["update_received", referent.id],
    ]);
  });

  it("annule un pointage fait par erreur", async () => {
    const undone = await run(as(referent.id), (tx, c) =>
      unmarkChequeReceived(tx, c, { chequeId: duboisFarm }),
    );
    expect(undone).toMatchObject({
      status: "saved",
      cheque: { status: "expected", receivedCents: null, chequeNumber: null },
    });
    expect((await journal(duboisFarm)).map((e) => e.action)).toEqual([
      "mark_received",
      "unmark_received",
    ]);
  });

  it("refuse les autres comptes (accès refusé)", async () => {
    // Référent d'un autre producteur : la base ne lui montre même pas ce chèque (S12).
    expect(await mark(as(otherReferent.id), { chequeId: martinFarm })).toEqual({
      status: "not_found",
    });
    // La famille voit son propre chèque, mais ne le pointe pas.
    await expect(mark(as(family.id), { chequeId: martinFarm })).rejects.toThrow(ForbiddenError);
    await expect(mark(as(admin.id, false), { chequeId: duboisFarm })).rejects.toThrow(
      SecondFactorRequiredError,
    );
    await expect(
      run(as(otherReferent.id), (tx, c) =>
        getChequePointage(tx, c, { amapProducerId: farm, month: "2026-12" }),
      ),
    ).rejects.toThrow(ForbiddenError);
    // L'admin vérifié pointe chez tous les producteurs.
    expect(await mark(as(admin.id, true), { chequeId: martinBakery })).toMatchObject({
      status: "saved",
    });
    await run(as(admin.id, true), (tx, c) =>
      unmarkChequeReceived(tx, c, { chequeId: martinBakery }),
    );
  });

  it("refuse un montant ou un numéro non valable, et un chèque déjà remis", async () => {
    expect(await mark(as(referent.id), { chequeId: duboisFarm, receivedCents: -5 })).toEqual({
      status: "invalid",
    });
    expect(
      await mark(as(referent.id), { chequeId: duboisFarm, chequeNumber: "9".repeat(31) }),
    ).toEqual({ status: "invalid" });
    expect(await mark(as(referent.id), { chequeId: uuidv7() })).toEqual({ status: "not_found" });
    await db.owner.update(cheque).set({ status: "handed_over" }).where(eq(cheque.id, duboisFarm));
    expect(await mark(as(referent.id), { chequeId: duboisFarm })).toEqual({
      status: "handed_over",
    });
    await db.owner.update(cheque).set({ status: "expected" }).where(eq(cheque.id, duboisFarm));
  });

  it("un chèque pointé verrouille la commande du foyer, même après réouverture", async () => {
    const reopened = await run(as(admin.id, true), (tx, c) =>
      reopenOrderPeriod(tx, c, { periodId, closesOn: "2026-11-30" }, NOW),
    );
    expect(reopened).toEqual({ status: "reopened" });
    const order = (itemId: string) =>
      run(as(family.id), (tx, c) =>
        setOrderQuantity(tx, c, { catalogItemId: itemId, distributionId: dec10, quantity: 2 }, NOW),
      );
    // Chèque de la ferme pointé : verrouillé. Chèque du fournil attendu : modifiable.
    expect(await order(eggs)).toEqual({ status: "locked", reason: "cheque_received" });
    expect(await order(bread)).toMatchObject({ status: "saved" });
  });
});
