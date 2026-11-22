import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  auditLog,
  catalog,
  catalogItem,
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
import { blockingTasks } from "@/server/producers";
import {
  createAdminReport,
  createFamilyReport,
  getAdminReportForm,
  getFamilyReports,
  listAllReports,
  listMyProducersReports,
  rejectReport,
} from "@/server/reports";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Distributions des 3 et 10 décembre ; commandes de janvier clôturées le 25 décembre au soir.
const NOW = new Date("2026-12-11T10:00:00Z");
const AFTER_NEXT_CLOSING = new Date("2026-12-26T10:00:00Z");

// Signalements (story F5), avec la vraie base et la RLS.
describe("Signalements (F5)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let martinUser: { id: string };
  let duboisUser: { id: string };
  let referent: { id: string }; // suit la ferme
  let otherReferent: { id: string }; // suit le fournil
  let admin: { id: string };
  let martin: string;
  let dubois: string;
  let martinEggsDec3: string; // 2 boîtes d'œufs le 3 décembre
  let martinBreadDec3: string;
  let duboisEggsDec10: string;
  let martinEggsDec17: string; // distribution à venir
  let dec10: string;

  const as = (userId: string, secondFactorVerified = true): AmapContext => ({
    amapId: amapA.id,
    userId,
    secondFactorVerified,
  });
  const run = <T>(ctx: AmapContext, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, ctx, fn);
  const familyReport = (userId: string, input: object, now = NOW) =>
    run(as(userId), (tx, c) =>
      createFamilyReport(tx, c, { quantity: 1, reason: "missing", comment: "", ...input }, now),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    martinUser = await f.createUser();
    duboisUser = await f.createUser();
    referent = await f.createUser();
    otherReferent = await f.createUser();
    admin = await f.createUser();
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");
    await f.grantRole(amapA.id, admin.id, "admin");

    [martin, dubois] = [uuidv7(), uuidv7()];
    await db.owner.insert(household).values([
      { id: martin, amapId: amapA.id, name: "Foyer Martin" },
      { id: dubois, amapId: amapA.id, name: "Foyer Dubois" },
    ]);
    await db.owner.insert(householdMember).values([
      { amapId: amapA.id, householdId: martin, userId: martinUser.id, isPrimary: true },
      { amapId: amapA.id, householdId: dubois, userId: duboisUser.id, isPrimary: true },
    ]);
    await db.owner.insert(orderPeriod).values([
      {
        amapId: amapA.id,
        month: "2026-12-01",
        ...periodInstants("2026-11-10", "2026-11-25"),
        status: "closed",
        closedAt: new Date("2026-11-25T23:00:00Z"),
      },
      { amapId: amapA.id, month: "2027-01-01", ...periodInstants("2026-12-10", "2026-12-25") },
    ]);
    const [dec3, dec17] = [uuidv7(), uuidv7()];
    dec10 = uuidv7();
    await db.owner.insert(distribution).values(
      [
        [dec3, "2026-12-03"],
        [dec10, "2026-12-10"],
        [dec17, "2026-12-17"],
      ].map(([id, date]) => ({
        id: id!,
        amapId: amapA.id,
        date: date!,
        startTime: "18:00",
        endTime: "19:30",
      })),
    );

    const [farmProducer, bakeryProducer] = [uuidv7(), uuidv7()];
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
    const [p1, p2, c1, c2, eggs, bread] = Array.from({ length: 6 }, () => uuidv7()) as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    await db.owner.insert(product).values([
      { id: p1, producerId: farmProducer, name: "Œufs, boîte de 6" },
      { id: p2, producerId: bakeryProducer, name: "Pain de campagne" },
    ]);
    await db.owner.insert(catalog).values([
      {
        id: c1,
        amapId: amapA.id,
        producerId: farmProducer,
        month: "2026-12-01",
        status: "published",
      },
      {
        id: c2,
        amapId: amapA.id,
        producerId: bakeryProducer,
        month: "2026-12-01",
        status: "published",
      },
    ]);
    await db.owner.insert(catalogItem).values([
      { id: eggs, amapId: amapA.id, catalogId: c1, productId: p1, priceCents: 300 },
      { id: bread, amapId: amapA.id, catalogId: c2, productId: p2, priceCents: 450 },
    ]);
    const [mFarm, mBakery, dFarm] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(order).values([
      { id: mFarm, amapId: amapA.id, householdId: martin, catalogId: c1 },
      { id: mBakery, amapId: amapA.id, householdId: martin, catalogId: c2 },
      { id: dFarm, amapId: amapA.id, householdId: dubois, catalogId: c1 },
    ]);
    [martinEggsDec3, martinBreadDec3, duboisEggsDec10, martinEggsDec17] = [
      uuidv7(),
      uuidv7(),
      uuidv7(),
      uuidv7(),
    ];
    const line = (
      id: string,
      orderId: string,
      itemId: string,
      day: string,
      q: number,
      price: number,
    ) => ({
      id,
      amapId: amapA.id,
      orderId,
      catalogItemId: itemId,
      distributionId: day,
      quantity: q,
      unitPriceCents: price,
    });
    await db.owner
      .insert(orderLine)
      .values([
        line(martinEggsDec3, mFarm, eggs, dec3, 2, 300),
        line(martinBreadDec3, mBakery, bread, dec3, 1, 450),
        line(duboisEggsDec10, dFarm, eggs, dec10, 1, 300),
        line(martinEggsDec17, mFarm, eggs, dec17, 1, 300),
      ]);
  });

  it("la famille voit ses seules lignes de distributions passées, et signale (accès autorisé)", async () => {
    const view = await run(as(martinUser.id), (tx, c) => getFamilyReports(tx, c, NOW));
    if (view.state !== "ready") throw new Error(view.state);
    // Pas la distribution à venir (17), ni la ligne du foyer Dubois.
    expect(view.lines.map((l) => [l.distributionDate, l.productName, l.reportable])).toEqual([
      ["2026-12-03", "Œufs, boîte de 6", 2],
      ["2026-12-03", "Pain de campagne", 1],
    ]);
    expect(await familyReport(martinUser.id, { orderLineId: martinEggsDec3 })).toMatchObject({
      status: "created",
    });
    // Il ne reste qu'une boîte à signaler sur cette ligne.
    expect(await familyReport(martinUser.id, { orderLineId: martinEggsDec3, quantity: 2 })).toEqual(
      { status: "invalid", problems: ["quantity"] },
    );
    expect(
      await familyReport(martinUser.id, { orderLineId: martinBreadDec3, reason: "other" }),
    ).toEqual({ status: "invalid", problems: ["comment_required"] });
    expect(
      await familyReport(martinUser.id, {
        orderLineId: martinBreadDec3,
        reason: "other",
        comment: "Pain brûlé",
      }),
    ).toMatchObject({ status: "created" });

    const entries = await db.owner
      .select({ actor: auditLog.actorUserId })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "report"), eq(auditLog.action, "create")));
    expect(entries).toHaveLength(2);
  });

  it("refuse la ligne d'un autre foyer, une distribution à venir, et après la clôture suivante", async () => {
    expect(await familyReport(martinUser.id, { orderLineId: duboisEggsDec10 })).toEqual({
      status: "not_reportable",
    });
    expect(await familyReport(martinUser.id, { orderLineId: martinEggsDec17 })).toEqual({
      status: "not_reportable",
    });
    expect(
      await familyReport(duboisUser.id, { orderLineId: duboisEggsDec10 }, AFTER_NEXT_CLOSING),
    ).toEqual({ status: "not_reportable" });
    // La base elle-même refuse un signalement au nom d'un autre foyer.
    await expect(
      run(as(martinUser.id), (tx) =>
        tx.insert(report).values({
          amapId: amapA.id,
          householdId: dubois,
          orderLineId: duboisEggsDec10,
          quantity: 1,
          reason: "missing",
          source: "family",
          createdBy: martinUser.id,
        }),
      ),
    ).rejects.toThrow();
  });

  it("l'admin reporte un écart de la feuille d'émargement, sans délai", async () => {
    const form = await run(as(admin.id, true), (tx, c) =>
      getAdminReportForm(tx, c, { distributionId: dec10 }, AFTER_NEXT_CLOSING),
    );
    expect(form.distributions.map((d) => d.date)).toEqual([
      "2026-12-17",
      "2026-12-10",
      "2026-12-03",
    ]);
    expect(form.households.map((h) => [h.name, h.lines.length])).toEqual([["Foyer Dubois", 1]]);
    expect(
      await run(as(admin.id, true), (tx, c) =>
        createAdminReport(
          tx,
          c,
          { orderLineId: duboisEggsDec10, quantity: 1, reason: "damaged", comment: "" },
          AFTER_NEXT_CLOSING,
        ),
      ),
    ).toMatchObject({ status: "created" });
    await expect(
      run(as(referent.id), (tx, c) => getAdminReportForm(tx, c, {}, NOW)),
    ).rejects.toThrow(ForbiddenError);
  });

  it("le référent voit les signalements de ses producteurs ; l'admin les voit tous", async () => {
    const mine = await run(as(referent.id), (tx, c) => listMyProducersReports(tx, c));
    expect(mine.map((r) => [r.householdName, r.productName, r.source])).toEqual([
      ["Foyer Dubois", "Œufs, boîte de 6", "admin"],
      ["Foyer Martin", "Œufs, boîte de 6", "family"],
    ]);
    expect(
      (await run(as(otherReferent.id), (tx, c) => listMyProducersReports(tx, c))).map(
        (r) => r.productName,
      ),
    ).toEqual(["Pain de campagne"]);
    expect(await run(as(admin.id, true), (tx, c) => listAllReports(tx, c))).toHaveLength(3);
    // La famille Dubois ne voit pas les signalements du foyer Martin.
    const dub = await run(as(duboisUser.id), (tx, c) => getFamilyReports(tx, c, NOW));
    if (dub.state !== "ready") throw new Error(dub.state);
    expect(dub.reports.map((r) => r.householdName)).toEqual(["Foyer Dubois"]);
    // Tâche « Bloquant » du tableau de bord.
    const tasks = await run(as(admin.id, true), (tx, c) => blockingTasks(tx, c, NOW));
    expect(tasks).toContainEqual({ kind: "open_reports", count: 3 });
  });

  it("le référent du producteur rejette, avec un motif (accès autorisé et refusé)", async () => {
    const [eggsReport] = (
      await run(as(referent.id), (tx, c) => listMyProducersReports(tx, c))
    ).filter((r) => r.householdName === "Foyer Martin");
    const reject = (ctx: AmapContext, note = "Boîte retrouvée au point de distribution") =>
      run(ctx, (tx, c) => rejectReport(tx, c, { reportId: eggsReport!.id, note }, NOW));

    // Autre référent : la base ne lui montre même pas ce signalement.
    expect(await reject(as(otherReferent.id))).toEqual({ status: "not_found" });
    await expect(reject(as(martinUser.id))).rejects.toThrow(ForbiddenError);
    await expect(reject(as(admin.id, false))).rejects.toThrow(SecondFactorRequiredError);
    expect(await reject(as(referent.id), "  ")).toEqual({ status: "invalid" });
    expect(await reject(as(referent.id))).toEqual({ status: "rejected" });
    expect(await reject(as(admin.id, true))).toEqual({ status: "already_decided" });

    // La famille voit le rejet et son motif ; la boîte redevient signalable.
    const view = await run(as(martinUser.id), (tx, c) => getFamilyReports(tx, c, NOW));
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.reports.find((r) => r.productName === "Œufs, boîte de 6")).toMatchObject({
      status: "rejected",
      decisionNote: "Boîte retrouvée au point de distribution",
    });
    expect(view.lines.find((l) => l.orderLineId === martinEggsDec3)?.reportable).toBe(2);
  });
});
