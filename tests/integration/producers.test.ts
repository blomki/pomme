import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  auditLog,
  household,
  householdMember,
  producer,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import { anonymizeHousehold } from "@/server/households";
import {
  attachProducer,
  blockingTasks,
  createProducer,
  getAmapProducer,
  listAmapProducers,
  listReferentCandidates,
  searchProducers,
  setProducerReferents,
  updateProducer,
} from "@/server/producers";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Producteurs et référents, côté administrateur (story C1), avec la vraie base et la RLS.
describe("Producteurs et référents (C1)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let amapien: { id: string };
  /** Producteur de l'AMAP B seulement. */
  let farmB: { producerId: string; amapProducerId: string };
  /** Producteur archivé de l'AMAP B. */
  let archivedFarm: string;

  const as = (userId: string, amapId: string, verified = true): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: verified,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor = admin.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);

  const create = (input: Record<string, unknown>) =>
    inA((tx, ctx) => createProducer(tx, ctx, input));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser({ firstName: "Alix" });
    referent = await f.createUser({ firstName: "Robin" });
    amapien = await f.createUser({ firstName: "Sam" });
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");

    farmB = { producerId: uuidv7(), amapProducerId: uuidv7() };
    await db.owner.insert(producer).values({
      id: farmB.producerId,
      name: "Fromagerie 100% chèvre",
      category: "Fromages",
      phone: "+33639980050",
      email: "contact@example.org",
    });
    await db.owner
      .insert(amapProducer)
      .values({ id: farmB.amapProducerId, amapId: amapB.id, producerId: farmB.producerId });
    archivedFarm = uuidv7();
    await db.owner
      .insert(producer)
      .values({ id: archivedFarm, name: "Fromagerie fermée", archivedAt: new Date() });
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  describe("création et lecture", () => {
    let created: string;

    it("crée un producteur dans l'AMAP, et l'inscrit au journal", async () => {
      const result = await create({
        name: " Boulangerie du Moulin ",
        category: "Pains",
        phone: "06 39 98 00 60",
        email: "Pain@Example.org",
        checkPayee: "EARL du Moulin",
        distanceKm: "12",
      });
      expect(result.status).toBe("saved");
      if (result.status !== "saved") return;
      created = result.amapProducerId;

      const detail = await inA((tx, ctx) => getAmapProducer(tx, ctx, created));
      expect(detail).toMatchObject({
        name: "Boulangerie du Moulin",
        phone: "+33639980060",
        email: "pain@example.org",
        checkPayee: "EARL du Moulin",
        distanceKm: 12,
        active: true,
        referents: [],
      });
      const entries = await db.owner.select().from(auditLog).where(eq(auditLog.entityId, created));
      expect(entries.map((e) => e.action)).toEqual(["create"]);
    });

    it("signale les champs invalides", async () => {
      const result = await create({ name: "", phone: "12", email: "x", distanceKm: "-1" });
      expect(result).toEqual({
        status: "invalid",
        fields: expect.arrayContaining(["name", "phone", "email", "distanceKm"]),
      });
    });

    it("ne montre que les producteurs de l'AMAP courante", async () => {
      const list = await inA((tx, ctx) => listAmapProducers(tx, ctx));
      expect(list.map((p) => p.name)).toEqual(["Boulangerie du Moulin"]);
      expect(await inA((tx, ctx) => getAmapProducer(tx, ctx, farmB.amapProducerId))).toBeNull();
      const visible = await inA((tx) => tx.select().from(producer));
      expect(visible.map((p) => p.name)).toEqual(["Boulangerie du Moulin"]);
    });

    it("signale le producteur sans référent comme tâche « Bloquant »", async () => {
      expect(await inA((tx, ctx) => blockingTasks(tx, ctx))).toEqual([
        {
          kind: "producer_without_referent",
          amapProducerId: created,
          name: "Boulangerie du Moulin",
        },
      ]);
    });
  });

  describe("rattacher un producteur existant", () => {
    it("trouve un producteur d'une autre AMAP par son nom, sans ses coordonnées", async () => {
      const results = await inA((tx, ctx) => searchProducers(tx, ctx, "100%"));
      expect(results).toEqual([
        { id: farmB.producerId, name: "Fromagerie 100% chèvre", category: "Fromages" },
      ]);
      // « % » est cherché tel quel : il ne veut pas dire « n'importe quoi ».
      expect(await inA((tx, ctx) => searchProducers(tx, ctx, "%"))).toEqual([]);
    });

    it("réserve la recherche aux admins de l'AMAP courante", async () => {
      await expect(
        inA((tx, ctx) => searchProducers(tx, ctx, "Fromagerie"), referent.id),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        inA((tx) => tx.execute(sql`select * from search_producers('Fromagerie')`), referent.id),
      ).rejects.toThrow();
    });

    it("rattache le producteur, une seule fois ; refuse un producteur archivé ou inconnu", async () => {
      const attach = (producerId: string) =>
        inA((tx, ctx) => attachProducer(tx, ctx, { producerId, checkPayee: "GAEC" }));
      expect((await attach(farmB.producerId)).status).toBe("saved");
      expect(await attach(farmB.producerId)).toEqual({ status: "already_attached" });
      expect(await attach(archivedFarm)).toEqual({ status: "not_found" });
      expect(await attach(uuidv7())).toEqual({ status: "not_found" });
      // Déjà dans l'AMAP : plus proposé par la recherche.
      expect(await inA((tx, ctx) => searchProducers(tx, ctx, "Fromagerie"))).toEqual([]);
    });
  });

  describe("modification et référents", () => {
    let amapProducerId: string;

    beforeAll(async () => {
      const result = await create({ name: "Vergers d'essai", checkPayee: "Ancien nom" });
      if (result.status !== "saved") throw new Error(result.status);
      amapProducerId = result.amapProducerId;
    });

    it("modifie la fiche et les réglages, et journalise l'ordre des chèques", async () => {
      const result = await inA((tx, ctx) =>
        updateProducer(tx, ctx, {
          amapProducerId,
          name: "Vergers d'essai",
          category: "Fruits",
          checkPayee: "SCEA des Vergers",
          distanceKm: "8",
          active: false,
        }),
      );
      expect(result).toEqual({ status: "saved", amapProducerId });
      const [entry] = await db.owner
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityId, amapProducerId), eq(auditLog.action, "update")));
      expect(entry?.before).toEqual({ checkPayee: "Ancien nom" });
      expect(entry?.after).toEqual({ checkPayee: "SCEA des Vergers", active: false });
      // Inactif : n'est pas une tâche bloquante, même sans référent.
      const tasks = await inA((tx, ctx) => blockingTasks(tx, ctx));
      expect(tasks.map((t) => ("name" in t ? t.name : t.kind))).not.toContain("Vergers d'essai");
    });

    it("n'affecte que des personnes qui ont le rôle référent", async () => {
      const candidates = await inA((tx, ctx) => listReferentCandidates(tx, ctx));
      expect(candidates.map((c) => c.userId)).toEqual([referent.id]);
      expect(
        await inA((tx, ctx) =>
          setProducerReferents(tx, ctx, { amapProducerId, userIds: [amapien.id] }),
        ),
      ).toEqual({ status: "not_referent" });
      expect(
        await inA((tx, ctx) =>
          setProducerReferents(tx, ctx, { amapProducerId, userIds: [referent.id] }),
        ),
      ).toEqual({ status: "saved" });
      const detail = await inA((tx, ctx) => getAmapProducer(tx, ctx, amapProducerId));
      expect(detail?.referents.map((r) => r.userId)).toEqual([referent.id]);
    });

    it("retire les affectations d'un référent dont le foyer est anonymisé (RGPD)", async () => {
      const f = fixtures(db.owner);
      const leaving = await f.createUser({ email: "depart@example.org", firstName: "Camille" });
      await f.grantRole(amapA.id, leaving.id, "referent");
      const followed = await create({ name: "Ruches du Bocage" });
      if (followed.status !== "saved") throw new Error(followed.status);
      await inA((tx, ctx) =>
        setProducerReferents(tx, ctx, {
          amapProducerId: followed.amapProducerId,
          userIds: [leaving.id],
        }),
      );
      const householdId = uuidv7();
      await db.owner
        .insert(household)
        .values({ id: householdId, amapId: amapA.id, name: "Foyer Camille" });
      await db.owner
        .insert(householdMember)
        .values({ amapId: amapA.id, householdId, userId: leaving.id, isPrimary: true });

      const result = await inA((tx, ctx) =>
        anonymizeHousehold(tx, ctx, { householdId, confirmName: "Foyer Camille" }),
      );
      expect(result.status).toBe("anonymized");
      const left = await db.owner
        .select()
        .from(referentAssignment)
        .where(eq(referentAssignment.userId, leaving.id));
      expect(left).toEqual([]);
      const tasks = await inA((tx, ctx) => blockingTasks(tx, ctx));
      expect(tasks.map((t) => ("name" in t ? t.name : t.kind))).toContain("Ruches du Bocage");
    });

    it("empêche, au niveau de la base, d'affecter un référent à un producteur d'une autre AMAP", async () => {
      await expect(
        inA((tx) =>
          tx.insert(referentAssignment).values({
            amapId: amapA.id,
            amapProducerId: farmB.amapProducerId,
            userId: referent.id,
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("accès refusé", () => {
    it("refuse chaque opération à un référent", async () => {
      const id = uuidv7();
      const operations: Array<(tx: never, ctx: AmapContext) => Promise<unknown>> = [
        (tx, ctx) => listAmapProducers(tx, ctx),
        (tx, ctx) => getAmapProducer(tx, ctx, id),
        (tx, ctx) => createProducer(tx, ctx, { name: "X" }),
        (tx, ctx) => attachProducer(tx, ctx, { producerId: id }),
        (tx, ctx) => updateProducer(tx, ctx, { amapProducerId: id, name: "X", active: true }),
        (tx, ctx) => setProducerReferents(tx, ctx, { amapProducerId: id, userIds: [] }),
        (tx, ctx) => listReferentCandidates(tx, ctx),
        (tx, ctx) => blockingTasks(tx, ctx),
      ];
      for (const operation of operations) {
        await expect(
          inA((tx, ctx) => operation(tx as never, ctx), referent.id),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
    });

    it("refuse un admin sans deuxième vérification", async () => {
      await expect(
        withAmapContext(db.app, as(admin.id, amapA.id, false), (tx, ctx) =>
          createProducer(tx, ctx, { name: "X" }),
        ),
      ).rejects.toBeInstanceOf(SecondFactorRequiredError);
    });

    it("refuse la création d'un producteur par la base, hors d'un admin", async () => {
      await expect(
        inA((tx) => tx.insert(producer).values({ name: "Pirate" }), referent.id),
      ).rejects.toThrow();
    });
  });
});
