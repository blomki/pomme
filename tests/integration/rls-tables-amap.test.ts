import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amap,
  amapProducer,
  amapRole,
  catalog,
  cheque,
  distribution,
  household,
  householdMember,
  membership,
  orderPeriod,
  producer,
  producerUser,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Row Level Security des tables de l'AMAP (story S13, ADR 0035), vérifiée directement dans la
// base avec la connexion de l'application, sans passer par le code serveur : c'est le deuxième
// rempart, il doit tenir seul.
describe("RLS des tables de l'AMAP (S13)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let otherReferent: { id: string };
  let martinUser: { id: string };
  let martinPartner: { id: string };
  let duboisUser: { id: string };
  let farmer: { id: string };
  let martin: string;
  let dubois: string;
  let petit: string;
  let farm: string;
  let bakery: string;
  let periodId: string;

  const ctx = (userId: string | null, trusted?: "closing_job"): AmapContext => ({
    amapId: amapA.id,
    userId,
    secondFactorVerified: true,
    ...(trusted ? { trusted } : {}),
  });
  const run = <T>(c: AmapContext, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, c, fn);
  const householdNames = async (userId: string | null) =>
    (await run(ctx(userId), (tx) => tx.select({ name: household.name }).from(household)))
      .map((h) => h.name)
      .sort();
  /** Une écriture refusée par la RLS échoue (insertion) ou ne touche aucune ligne (modification). */
  const updatedRows = <T>(userId: string | null, fn: Parameters<typeof withAmapContext<T[]>>[2]) =>
    run(ctx(userId), fn).then((rows) => rows.length);

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    const users = await Promise.all(Array.from({ length: 7 }, () => f.createUser()));
    [admin, referent, otherReferent, martinUser, martinPartner, duboisUser, farmer] =
      users as unknown as [
        { id: string },
        { id: string },
        { id: string },
        { id: string },
        { id: string },
        { id: string },
        { id: string },
      ];
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");

    [martin, dubois, petit] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(household).values([
      { id: martin, amapId: amapA.id, name: "Foyer Martin" },
      { id: dubois, amapId: amapA.id, name: "Foyer Dubois" },
      { id: petit, amapId: amapA.id, name: "Foyer Petit" },
    ]);
    await db.owner.insert(householdMember).values([
      { amapId: amapA.id, householdId: martin, userId: martinUser.id, isPrimary: true },
      { amapId: amapA.id, householdId: martin, userId: martinPartner.id, isPrimary: false },
      { amapId: amapA.id, householdId: dubois, userId: duboisUser.id, isPrimary: true },
    ]);
    await db.owner.insert(membership).values([
      { amapId: amapA.id, householdId: martin, startDate: "2026-01-01", endDate: "2026-12-31" },
      { amapId: amapA.id, householdId: dubois, startDate: "2026-01-01", endDate: "2026-12-31" },
    ]);

    const [farmProducer, bakeryProducer] = [uuidv7(), uuidv7()];
    await db.owner.insert(producer).values([
      { id: farmProducer, name: "Ferme d'essai" },
      { id: bakeryProducer, name: "Fournil d'essai" },
    ]);
    [farm, bakery] = [uuidv7(), uuidv7()];
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId: farmProducer },
      { id: bakery, amapId: amapA.id, producerId: bakeryProducer },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: referent.id },
      { amapId: amapA.id, amapProducerId: bakery, userId: otherReferent.id },
    ]);
    await db.owner.insert(producerUser).values({ producerId: farmProducer, userId: farmer.id });
    periodId = uuidv7();
    await db.owner.insert(orderPeriod).values({
      id: periodId,
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-10", "2026-11-25"),
    });
    await db.owner.insert(catalog).values({
      amapId: amapA.id,
      producerId: farmProducer,
      month: "2026-12-01",
      status: "published",
    });
    // La ferme attend un chèque du foyer Martin seulement.
    await db.owner.insert(cheque).values({
      amapId: amapA.id,
      householdId: martin,
      producerId: farmProducer,
      orderPeriodId: periodId,
      grossCents: 1200,
      expectedCents: 1200,
    });
    await db.owner.insert(distribution).values({
      amapId: amapA.id,
      date: "2026-12-03",
      startTime: "18:00",
      endTime: "19:30",
    });
  });

  it("foyers : jamais un visiteur ; une famille, le sien ; l'équipe, tous ; le producteur, ses clients", async () => {
    expect(await householdNames(null)).toEqual([]);
    expect(await householdNames(martinUser.id)).toEqual(["Foyer Martin"]);
    expect(await householdNames(admin.id)).toEqual(["Foyer Dubois", "Foyer Martin", "Foyer Petit"]);
    expect(await householdNames(referent.id)).toEqual([
      "Foyer Dubois",
      "Foyer Martin",
      "Foyer Petit",
    ]);
    expect(await householdNames(farmer.id)).toEqual(["Foyer Martin"]);
    // La tâche horaire (accès de confiance) les voit tous.
    const trusted = await run(ctx(null, "closing_job"), (tx) => tx.select().from(household));
    expect(trusted).toHaveLength(3);
  });

  it("membres et adhésions : son foyer, ou l'équipe ; rien pour un visiteur ni un producteur", async () => {
    const members = (userId: string | null) =>
      run(ctx(userId), (tx) => tx.select({ userId: householdMember.userId }).from(householdMember));
    expect(await members(null)).toEqual([]);
    expect(await members(farmer.id)).toEqual([]);
    // Martin voit les deux membres de son foyer, pas Dubois.
    expect((await members(martinUser.id)).map((m) => m.userId).sort()).toEqual(
      [martinUser.id, martinPartner.id].sort(),
    );
    expect(await members(referent.id)).toHaveLength(3);
    const memberships = (userId: string | null) =>
      run(ctx(userId), (tx) => tx.select().from(membership));
    expect(await memberships(null)).toEqual([]);
    expect(await memberships(duboisUser.id)).toHaveLength(1);
    expect(await memberships(admin.id)).toHaveLength(2);
  });

  it("écriture des foyers, membres et adhésions : les admins seulement", async () => {
    for (const userId of [null, martinUser.id, referent.id, farmer.id]) {
      await expect(
        run(ctx(userId), (tx) =>
          tx.insert(household).values({ amapId: amapA.id, name: `Pirate ${userId ?? "visiteur"}` }),
        ),
      ).rejects.toThrow();
      expect(
        await updatedRows(userId, (tx) =>
          tx.update(household).set({ name: "Renommé" }).where(eq(household.id, martin)).returning(),
        ),
      ).toBe(0);
      expect(
        await updatedRows(userId, (tx) =>
          tx.delete(householdMember).where(eq(householdMember.householdId, dubois)).returning(),
        ),
      ).toBe(0);
    }
    expect(
      await updatedRows(admin.id, (tx) =>
        tx
          .update(membership)
          .set({ note: "Vu" })
          .where(eq(membership.householdId, martin))
          .returning(),
      ),
    ).toBe(1);
    expect(
      await updatedRows(martinUser.id, (tx) =>
        tx
          .update(membership)
          .set({ endDate: "2030-12-31" })
          .where(eq(membership.householdId, martin))
          .returning(),
      ),
    ).toBe(0);
  });

  it("rôles : personne d'autre qu'un admin ne s'en donne un", async () => {
    for (const userId of [martinUser.id, referent.id, farmer.id]) {
      await expect(
        run(ctx(userId), (tx) =>
          tx.insert(amapRole).values({ amapId: amapA.id, userId, role: "admin" }),
        ),
      ).rejects.toThrow();
    }
    await run(ctx(admin.id), (tx) =>
      tx.insert(amapRole).values({ amapId: amapA.id, userId: duboisUser.id, role: "referent" }),
    );
    // Tout le monde dans l'AMAP voit qui est admin ou référent.
    expect(await run(ctx(martinUser.id), (tx) => tx.select().from(amapRole))).toHaveLength(4);
  });

  it("AMAP, distributions, périodes, producteurs, référents : écriture réservée", async () => {
    // Le nom de l'AMAP : ses admins seulement.
    expect(
      await updatedRows(martinUser.id, (tx) =>
        tx.update(amap).set({ name: "Piratée" }).where(eq(amap.id, amapA.id)).returning(),
      ),
    ).toBe(0);
    expect(
      await updatedRows(admin.id, (tx) =>
        tx.update(amap).set({ name: "AMAP A" }).where(eq(amap.id, amapA.id)).returning(),
      ),
    ).toBe(1);
    // Distributions : lues par un visiteur, écrites par un admin seulement.
    expect(await run(ctx(null), (tx) => tx.select().from(distribution))).toHaveLength(1);
    expect(
      await updatedRows(referent.id, (tx) =>
        tx.update(distribution).set({ startTime: "17:00" }).returning(),
      ),
    ).toBe(0);
    // Période : un admin, ou la tâche horaire ; pas une famille.
    expect(
      await updatedRows(martinUser.id, (tx) =>
        tx
          .update(orderPeriod)
          .set({ status: "open" })
          .where(eq(orderPeriod.id, periodId))
          .returning(),
      ),
    ).toBe(0);
    expect(
      (
        await run(ctx(null, "closing_job"), (tx) =>
          tx
            .update(orderPeriod)
            .set({ status: "open" })
            .where(eq(orderPeriod.id, periodId))
            .returning(),
        )
      ).length,
    ).toBe(1);
    // Ordre des chèques : le référent de ce producteur, pas celui d'un autre.
    expect(
      await updatedRows(referent.id, (tx) =>
        tx
          .update(amapProducer)
          .set({ checkPayee: "EARL d'essai" })
          .where(eq(amapProducer.id, farm))
          .returning(),
      ),
    ).toBe(1);
    expect(
      await updatedRows(referent.id, (tx) =>
        tx
          .update(amapProducer)
          .set({ checkPayee: "Pirate" })
          .where(eq(amapProducer.id, bakery))
          .returning(),
      ),
    ).toBe(0);
    // Affectations de référents : les admins seulement.
    await expect(
      run(ctx(referent.id), (tx) =>
        tx
          .insert(referentAssignment)
          .values({ amapId: amapA.id, amapProducerId: bakery, userId: referent.id }),
      ),
    ).rejects.toThrow();
    expect(
      await updatedRows(otherReferent.id, (tx) =>
        tx
          .delete(referentAssignment)
          .where(eq(referentAssignment.amapProducerId, farm))
          .returning(),
      ),
    ).toBe(0);
  });
});
