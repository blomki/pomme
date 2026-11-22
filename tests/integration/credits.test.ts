import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

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
  referentAssignment,
  report,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import { creditFromReport, listAllCredits, listMyProducersCredits } from "@/server/credits";
import { closePeriod } from "@/server/order-periods";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

const NOW = new Date("2026-12-11T10:00:00Z");
const JANUARY_CLOSING = new Date("2026-12-26T10:00:00Z");

// Avoirs (story F2), avec la vraie base et la RLS.
describe("Avoirs (F2)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let family: { id: string };
  let referent: { id: string }; // suit la ferme
  let otherReferent: { id: string }; // suit le fournil
  let admin: { id: string };
  let martin: string;
  let farmProducer: string;
  let januaryPeriod: string;
  let missingReport: string; // 2 boîtes d'œufs manquantes
  let otherReport: string; // « Autre »
  let secondReport: string;

  const as = (userId: string, secondFactorVerified = true): AmapContext => ({
    amapId: amapA.id,
    userId,
    secondFactorVerified,
  });
  const run = <T>(ctx: AmapContext, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, ctx, fn);
  const credit_ = (ctx: AmapContext, input: object) =>
    run(ctx, (tx, c) => creditFromReport(tx, c, { pickedUp: false, ...input }, NOW));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    family = await f.createUser();
    referent = await f.createUser();
    otherReferent = await f.createUser();
    admin = await f.createUser();
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");
    await f.grantRole(amapA.id, admin.id, "admin");

    martin = uuidv7();
    await db.owner.insert(household).values({ id: martin, amapId: amapA.id, name: "Foyer Martin" });
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: martin, userId: family.id, isPrimary: true });

    farmProducer = uuidv7();
    const bakeryProducer = uuidv7();
    await db.owner.insert(producer).values([
      { id: farmProducer, name: "Ferme d'essai" },
      { id: bakeryProducer, name: "Fournil d'essai" },
    ]);
    const [farm, bakery] = [uuidv7(), uuidv7()];
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId: farmProducer },
      { id: bakery, amapId: amapA.id, producerId: bakeryProducer },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: referent.id },
      { amapId: amapA.id, amapProducerId: bakery, userId: otherReferent.id },
    ]);

    januaryPeriod = uuidv7();
    await db.owner.insert(orderPeriod).values([
      {
        amapId: amapA.id,
        month: "2026-12-01",
        ...periodInstants("2026-11-10", "2026-11-25"),
        status: "closed",
        closedAt: new Date("2026-11-25T23:00:00Z"),
      },
      {
        id: januaryPeriod,
        amapId: amapA.id,
        month: "2027-01-01",
        ...periodInstants("2026-12-10", "2026-12-25"),
        status: "open",
      },
    ]);
    const [dec3, jan7] = [uuidv7(), uuidv7()];
    await db.owner.insert(distribution).values([
      { id: dec3, amapId: amapA.id, date: "2026-12-03", startTime: "18:00", endTime: "19:30" },
      { id: jan7, amapId: amapA.id, date: "2027-01-07", startTime: "18:00", endTime: "19:30" },
    ]);
    const [eggsProduct, decCatalog, janCatalog, eggsDec, eggsJan] = Array.from({ length: 5 }, () =>
      uuidv7(),
    ) as [string, string, string, string, string];
    await db.owner
      .insert(product)
      .values({ id: eggsProduct, producerId: farmProducer, name: "Œufs, boîte de 6" });
    await db.owner.insert(catalog).values([
      {
        id: decCatalog,
        amapId: amapA.id,
        producerId: farmProducer,
        month: "2026-12-01",
        status: "published",
      },
      {
        id: janCatalog,
        amapId: amapA.id,
        producerId: farmProducer,
        month: "2027-01-01",
        status: "published",
      },
    ]);
    await db.owner.insert(catalogItem).values([
      {
        id: eggsDec,
        amapId: amapA.id,
        catalogId: decCatalog,
        productId: eggsProduct,
        priceCents: 350,
      },
      {
        id: eggsJan,
        amapId: amapA.id,
        catalogId: janCatalog,
        productId: eggsProduct,
        priceCents: 350,
      },
    ]);
    const [decOrder, janOrder] = [uuidv7(), uuidv7()];
    await db.owner.insert(order).values([
      { id: decOrder, amapId: amapA.id, householdId: martin, catalogId: decCatalog },
      { id: janOrder, amapId: amapA.id, householdId: martin, catalogId: janCatalog },
    ]);
    const decLine = uuidv7();
    await db.owner.insert(orderLine).values([
      {
        id: decLine,
        amapId: amapA.id,
        orderId: decOrder,
        catalogItemId: eggsDec,
        distributionId: dec3,
        quantity: 4,
        unitPriceCents: 350,
      },
      {
        amapId: amapA.id,
        orderId: janOrder,
        catalogItemId: eggsJan,
        distributionId: jan7,
        quantity: 3,
        unitPriceCents: 350,
      },
    ]);
    [missingReport, otherReport, secondReport] = [uuidv7(), uuidv7(), uuidv7()];
    const base = {
      amapId: amapA.id,
      householdId: martin,
      orderLineId: decLine,
      source: "family" as const,
      createdBy: family.id,
    };
    await db.owner.insert(report).values([
      { ...base, id: missingReport, quantity: 2, reason: "missing" },
      { ...base, id: otherReport, quantity: 1, reason: "other", comment: "Œufs fêlés" },
      { ...base, id: secondReport, quantity: 1, reason: "damaged" },
    ]);
  });

  it("le référent crée l'avoir d'un signalement, du montant choisi (accès autorisé)", async () => {
    // Montant ajusté : 6 € au lieu des 7 € proposés (2 × 3,50 €).
    const created = await credit_(as(referent.id), { reportId: missingReport, amountCents: 600 });
    expect(created).toMatchObject({ status: "credited" });
    const [row] = await db.owner.select().from(report).where(eq(report.id, missingReport));
    expect(row).toMatchObject({ status: "credited", decidedBy: referent.id });
    const [made] = await db.owner.select().from(credit).where(eq(credit.reportId, missingReport));
    expect(made).toMatchObject({
      householdId: martin,
      producerId: farmProducer,
      amountCents: 600,
      status: "created",
    });
    const journal = await db.owner
      .select({ type: auditLog.entityType, action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.actorUserId, referent.id)));
    expect(journal).toEqual(
      expect.arrayContaining([
        { type: "credit", action: "create" },
        { type: "report", action: "credit" },
      ]),
    );
    // Un signalement déjà crédité ne donne pas un second avoir.
    expect(await credit_(as(referent.id), { reportId: missingReport, amountCents: 600 })).toEqual({
      status: "already_decided",
    });
  });

  it("refuse un montant nul et, pour « Autre », un retrait non confirmé", async () => {
    expect(await credit_(as(referent.id), { reportId: secondReport, amountCents: 0 })).toEqual({
      status: "invalid",
      problems: ["amount"],
    });
    expect(await credit_(as(referent.id), { reportId: otherReport, amountCents: 350 })).toEqual({
      status: "invalid",
      problems: ["picked_up"],
    });
    expect(
      await credit_(as(referent.id), { reportId: otherReport, amountCents: 350, pickedUp: true }),
    ).toMatchObject({ status: "credited" });
  });

  it("refuse les autres comptes (accès refusé)", async () => {
    // Autre référent : la base ne lui montre même pas le signalement.
    expect(
      await credit_(as(otherReferent.id), { reportId: secondReport, amountCents: 350 }),
    ).toEqual({ status: "not_found" });
    await expect(
      credit_(as(family.id), { reportId: secondReport, amountCents: 350 }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      credit_(as(admin.id, false), { reportId: secondReport, amountCents: 350 }),
    ).rejects.toThrow(SecondFactorRequiredError);
    // La famille ne peut pas non plus écrire un avoir directement dans la base.
    await expect(
      run(as(family.id), (tx) =>
        tx.insert(credit).values({
          amapId: amapA.id,
          householdId: martin,
          producerId: farmProducer,
          amountCents: 10_000,
        }),
      ),
    ).rejects.toThrow();
  });

  it("à la clôture suivante, les avoirs sont déduits du chèque et y sont rattachés", async () => {
    const summary = await run(as(admin.id, true), (tx, c) =>
      closePeriod(tx, c, januaryPeriod, JANUARY_CLOSING),
    );
    expect(summary).toMatchObject({ cheques: 1 });
    const [janCheque] = await db.owner
      .select()
      .from(cheque)
      .where(eq(cheque.orderPeriodId, januaryPeriod));
    // Commande de janvier : 3 × 3,50 € = 10,50 € ; avoirs 6,00 € + 3,50 €.
    expect(janCheque).toMatchObject({ grossCents: 1050, creditsCents: 950, expectedCents: 100 });
    const credits = await db.owner.select().from(credit).where(eq(credit.householdId, martin));
    expect(
      credits.every((c) => c.status === "deducted" && c.deductedOnChequeId === janCheque!.id),
    ).toBe(true);
  });

  it("montre l'historique au référent (ses producteurs), à l'admin (tous), et à la famille", async () => {
    const mine = await run(as(referent.id), (tx, c) => listMyProducersCredits(tx, c));
    expect(mine.map((c) => [c.householdName, c.amountCents, c.status, c.deductedMonth])).toEqual(
      expect.arrayContaining([
        ["Foyer Martin", 600, "deducted", "2027-01"],
        ["Foyer Martin", 350, "deducted", "2027-01"],
      ]),
    );
    expect(mine[0]?.source?.productName).toBe("Œufs, boîte de 6");
    expect(await run(as(otherReferent.id), (tx, c) => listMyProducersCredits(tx, c))).toEqual([]);
    expect(await run(as(admin.id, true), (tx, c) => listAllCredits(tx, c))).toHaveLength(2);
    // La famille lit ses propres avoirs dans la base (pour son récapitulatif).
    expect(await run(as(family.id), (tx) => tx.select().from(credit))).toHaveLength(2);
  });
});
