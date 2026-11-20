import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  cheque,
  credit,
  distribution,
  household,
  householdMember,
  orderPeriod,
  producer,
  producerUser,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError } from "@/server/auth/errors";
import { getProducerPayments } from "@/server/producer-payments";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Après la clôture de janvier, avant sa première distribution (le 7).
const NOW = new Date("2026-12-28T10:00:00Z");

// « Mes paiements » du producteur (story F4), avec la vraie base et la RLS.
describe("Mes paiements (F4)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let farmer: { id: string };
  let referent: { id: string };
  let otherReferent: { id: string };
  let admin: { id: string };
  let family: { id: string };
  let farm: string;
  let farmB: string;

  const as = (userId: string, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const read = (userId: string, month?: string, amapProducerId = farm, amapId = amapA.id) =>
    withAmapContext(db.app, as(userId, amapId), (tx, c) =>
      getProducerPayments(tx, c, { amapProducerId, month }, NOW),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    farmer = await f.createUser();
    referent = await f.createUser();
    otherReferent = await f.createUser();
    admin = await f.createUser();
    family = await f.createUser();
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");
    await f.grantRole(amapA.id, admin.id, "admin");

    const [farmProducer, bakeryProducer] = [uuidv7(), uuidv7()];
    await db.owner.insert(producer).values([
      { id: farmProducer, name: "Ferme d'essai" },
      { id: bakeryProducer, name: "Fournil d'essai" },
    ]);
    [farm, farmB] = [uuidv7(), uuidv7()];
    const bakery = uuidv7();
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId: farmProducer },
      { id: bakery, amapId: amapA.id, producerId: bakeryProducer },
      { id: farmB, amapId: amapB.id, producerId: farmProducer },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: referent.id },
      { amapId: amapA.id, amapProducerId: bakery, userId: otherReferent.id },
    ]);
    await db.owner.insert(producerUser).values({ producerId: farmProducer, userId: farmer.id });

    const [martin, dubois, petit, other] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(household).values([
      { id: martin, amapId: amapA.id, name: "Foyer Martin" },
      { id: dubois, amapId: amapA.id, name: "Foyer Dubois" },
      { id: petit, amapId: amapA.id, name: "Foyer Petit" },
      { id: other, amapId: amapB.id, name: "Foyer d'une autre AMAP" },
    ]);
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: martin, userId: family.id, isPrimary: true });

    const [december, january, januaryB] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(orderPeriod).values([
      {
        id: december,
        amapId: amapA.id,
        month: "2026-12-01",
        ...periodInstants("2026-11-10", "2026-11-25"),
        status: "closed",
      },
      {
        id: january,
        amapId: amapA.id,
        month: "2027-01-01",
        ...periodInstants("2026-12-10", "2026-12-25"),
        status: "closed",
      },
      {
        id: januaryB,
        amapId: amapB.id,
        month: "2027-01-01",
        ...periodInstants("2026-12-10", "2026-12-25"),
        status: "closed",
      },
    ]);
    await db.owner.insert(distribution).values([
      { amapId: amapA.id, date: "2027-01-14", startTime: "18:00", endTime: "19:30" },
      { amapId: amapA.id, date: "2027-01-07", startTime: "18:00", endTime: "19:30" },
    ]);

    const handedAt = new Date("2026-12-03T18:30:00Z");
    const base = { amapId: amapA.id, producerId: farmProducer, creditsCents: 0 };
    const martinJanuary = uuidv7();
    await db.owner.insert(cheque).values([
      // Décembre : tout est remis.
      {
        ...base,
        householdId: martin,
        orderPeriodId: december,
        grossCents: 1200,
        expectedCents: 1200,
        status: "handed_over",
        receivedCents: 1200,
        handedOverAt: handedAt,
      },
      // Janvier : Martin reçu (avoir de 4 € déduit), Dubois attendu, Petit reçu avec un écart.
      {
        ...base,
        id: martinJanuary,
        householdId: martin,
        orderPeriodId: january,
        grossCents: 1200,
        creditsCents: 400,
        expectedCents: 800,
        status: "received",
        receivedCents: 800,
      },
      {
        ...base,
        householdId: dubois,
        orderPeriodId: january,
        grossCents: 800,
        expectedCents: 800,
      },
      {
        ...base,
        householdId: petit,
        orderPeriodId: january,
        grossCents: 2400,
        expectedCents: 2400,
        status: "received",
        receivedCents: 2000,
      },
      // Le fournil : pas pour la ferme.
      {
        ...base,
        producerId: bakeryProducer,
        householdId: dubois,
        orderPeriodId: january,
        grossCents: 450,
        expectedCents: 450,
      },
      // La ferme dans une autre AMAP : pas dans celle-ci.
      {
        ...base,
        amapId: amapB.id,
        householdId: other,
        orderPeriodId: januaryB,
        grossCents: 999,
        expectedCents: 999,
      },
    ]);
    await db.owner.insert(credit).values([
      {
        amapId: amapA.id,
        householdId: martin,
        producerId: farmProducer,
        amountCents: 400,
        status: "deducted",
        deductedOnChequeId: martinJanuary,
      },
      { amapId: amapA.id, householdId: dubois, producerId: farmProducer, amountCents: 300 },
      { amapId: amapA.id, householdId: dubois, producerId: bakeryProducer, amountCents: 150 },
    ]);
  });

  it("le producteur voit le dernier mois, foyer par foyer, avoirs déduits compris (accès autorisé)", async () => {
    const view = await read(farmer.id);
    expect(view.months).toEqual([
      { month: "2027-01", total: 3, received: 2, handedOverOn: null },
      { month: "2026-12", total: 1, received: 1, handedOverOn: "2026-12-03" },
    ]);
    expect(view.chosen?.month).toBe("2027-01");
    expect(view.chosen?.summary).toEqual({
      total: 3,
      received: 2,
      expectedCents: 4000,
      creditsCents: 400,
      allHandedOver: false,
    });
    expect(view.chosen?.handOver).toEqual({ kind: "planned", on: "2027-01-07" });
    expect(
      view.chosen?.rows.map((r) => [r.householdName, r.state, r.creditsCents, r.receivedCents]),
    ).toEqual([
      ["Foyer Dubois", "pending", 0, null],
      ["Foyer Martin", "received", 400, 800],
      ["Foyer Petit", "gap", 0, 2000],
    ]);
    // Avoirs : celui qui attend, puis celui déduit en janvier ; pas celui du fournil. Le
    // signalement d'origine reste caché au producteur.
    expect(view.credits.map((c) => [c.householdName, c.amountCents, c.deductedMonth])).toEqual(
      expect.arrayContaining([
        ["Foyer Dubois", 300, null],
        ["Foyer Martin", 400, "2027-01"],
      ]),
    );
    expect(view.credits).toHaveLength(2);
  });

  it("un mois précédent : la remise faite ; un mois inconnu revient au dernier", async () => {
    const december = await read(farmer.id, "2026-12");
    expect(december.chosen?.handOver).toEqual({ kind: "handed", on: "2026-12-03" });
    expect(december.chosen?.rows.map((r) => r.state)).toEqual(["handed_over"]);
    // Avoirs déduits en décembre : aucun ; celui qui attend reste affiché.
    expect(december.credits.map((c) => c.amountCents)).toEqual([300]);
    expect((await read(farmer.id, "2025-05")).chosen?.month).toBe("2027-01");
    expect((await read(farmer.id, "n'importe quoi")).chosen?.month).toBe("2027-01");
  });

  it("le référent du producteur voit aussi ; ailleurs, rien de cette AMAP", async () => {
    expect((await read(referent.id)).chosen?.rows).toHaveLength(3);
    // Dans l'autre AMAP, la ferme ne voit que ses chèques de là-bas.
    const inB = await read(farmer.id, undefined, farmB, amapB.id);
    expect(inB.chosen?.rows.map((r) => r.householdName)).toEqual(["Foyer d'une autre AMAP"]);
  });

  it("refuse le référent d'un autre producteur, l'admin et la famille (accès refusé)", async () => {
    for (const user of [otherReferent, admin, family]) {
      await expect(read(user.id)).rejects.toThrow(ForbiddenError);
    }
    // Pas de lien entre la ferme et l'AMAP B pour ce compte dans l'AMAP A.
    await expect(read(farmer.id, undefined, farmB)).rejects.toThrow(ForbiddenError);
  });
});
