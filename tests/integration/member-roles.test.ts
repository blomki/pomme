import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { amapProducer, amapRole, auditLog, producer, referentAssignment } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError } from "@/server/auth/errors";
import { createHousehold } from "@/server/households";
import { listRoleProducers, saveMemberRoles } from "@/server/member-roles";
import { blockingTasks, getAmapProducer, setProducerReferents } from "@/server/producers";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Fenêtre « Rôles » d'un membre : une case « Référent » par producteur (fiche #138), avec la
// vraie base et la RLS. Le rôle de référent se déduit des producteurs suivis, d'un côté (fiche
// du membre) comme de l'autre (fiche du producteur).
describe("Référent par producteur (#138)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let newcomer: string;
  const farms: Record<string, string> = {};
  let otherAmapFarm: string;

  const as = (userId: string, amapId: string): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor = admin.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);
  const save = (userId: string, referentOf: string[], wantsAdmin = false) =>
    inA((tx, ctx) => saveMemberRoles(tx, ctx, { userId, admin: wantsAdmin, referentOf }));
  const followed = async (userId: string) =>
    (
      await db.owner
        .select({ id: referentAssignment.amapProducerId })
        .from(referentAssignment)
        .where(eq(referentAssignment.userId, userId))
    )
      .map((r) => r.id)
      .sort();
  const isReferent = async (userId: string) =>
    (
      await db.owner
        .select()
        .from(amapRole)
        .where(and(eq(amapRole.userId, userId), eq(amapRole.role, "referent")))
    ).length > 0;

  async function addFarm(amapId: string, name: string, active = true) {
    const producerId = uuidv7();
    const amapProducerId = uuidv7();
    await db.owner.insert(producer).values({ id: producerId, name });
    await db.owner
      .insert(amapProducer)
      .values({ id: amapProducerId, amapId, producerId, active, checkPayee: name });
    return amapProducerId;
  }

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-roles-a");
    amapB = await f.createAmap("amap-roles-b");
    admin = await f.createUser({ firstName: "Alix" });
    referent = await f.createUser({ firstName: "Robin" });
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    farms.ruches = await addFarm(amapA.id, "Les Ruches du Vallon");
    farms.boulangerie = await addFarm(amapA.id, "Boulangerie des Trois Moulins");
    farms.vergers = await addFarm(amapA.id, "Vergers d'essai");
    farms.endormie = await addFarm(amapA.id, "Ferme endormie", false);
    otherAmapFarm = await addFarm(amapB.id, "Fromagerie de l'autre AMAP");
    await db.owner.insert(referentAssignment).values(
      [farms.ruches!, farms.boulangerie!].map((amapProducerId) => ({
        amapId: amapA.id,
        amapProducerId,
        userId: referent.id,
      })),
    );

    const created = await inA((tx, ctx) =>
      createHousehold(tx, ctx, {
        name: "Foyer Nouveau",
        members: [{ email: "nouveau.referent@example.org", firstName: "Nina", isPrimary: true }],
      }),
    );
    if (created.status !== "created") throw new Error(created.status);
    newcomer = created.invitations[0]!.userId;
  }, 120_000);

  it("liste les producteurs actifs, par nom, avec leurs référents (accès autorisé)", async () => {
    const list = await inA((tx, ctx) => listRoleProducers(tx, ctx));
    expect(list.map((p) => [p.name, p.referentIds])).toEqual([
      ["Boulangerie des Trois Moulins", [referent.id]],
      ["Les Ruches du Vallon", [referent.id]],
      ["Vergers d'essai", []],
    ]);
  });

  it("décocher un seul producteur retire cette affectation et garde les autres", async () => {
    expect(await save(referent.id, [farms.ruches!])).toEqual({ status: "saved" });
    expect(await followed(referent.id)).toEqual([farms.ruches!]);
    expect(await isReferent(referent.id)).toBe(true);
    const [entry] = await db.owner
      .select({ action: auditLog.action, before: auditLog.before })
      .from(auditLog)
      .where(eq(auditLog.entityId, farms.boulangerie!));
    expect(entry).toEqual({ action: "unassign_referent", before: { userId: referent.id } });
  });

  it("la fiche du producteur voit le même changement", async () => {
    const ruches = await inA((tx, ctx) => getAmapProducer(tx, ctx, farms.ruches!));
    expect(ruches?.referents.map((r) => r.userId)).toEqual([referent.id]);
    const boulangerie = await inA((tx, ctx) => getAmapProducer(tx, ctx, farms.boulangerie!));
    expect(boulangerie?.referents).toEqual([]);
  });

  it("un producteur sans référent devient une tâche « Bloquant »", async () => {
    const tasks = await inA((tx, ctx) => blockingTasks(tx, ctx));
    expect(tasks.map((t) => ("name" in t ? t.name : t.kind))).toContain(
      "Boulangerie des Trois Moulins",
    );
  });

  it("cocher un producteur à une personne sans rôle la rend référente de ce producteur", async () => {
    expect(await isReferent(newcomer)).toBe(false);
    expect(await save(newcomer, [farms.vergers!])).toEqual({ status: "saved" });
    expect(await isReferent(newcomer)).toBe(true);
    expect(await followed(newcomer)).toEqual([farms.vergers!]);
  });

  it("décocher tous les producteurs retire le rôle de référent", async () => {
    expect(await save(newcomer, [])).toEqual({ status: "saved" });
    expect(await isReferent(newcomer)).toBe(false);
    expect(await followed(newcomer)).toEqual([]);
  });

  it("garde l'affectation d'un producteur inactif, et donc le rôle", async () => {
    await db.owner
      .insert(referentAssignment)
      .values({ amapId: amapA.id, amapProducerId: farms.endormie!, userId: referent.id });
    expect(await save(referent.id, [])).toEqual({ status: "saved" });
    expect(await followed(referent.id)).toEqual([farms.endormie!]);
    expect(await isReferent(referent.id)).toBe(true);
  });

  it("la fiche du producteur retire aussi le rôle avec le dernier producteur suivi", async () => {
    expect(await save(newcomer, [farms.vergers!])).toEqual({ status: "saved" });
    expect(
      await inA((tx, ctx) =>
        setProducerReferents(tx, ctx, { amapProducerId: farms.vergers!, userIds: [] }),
      ),
    ).toEqual({ status: "saved" });
    expect(await isReferent(newcomer)).toBe(false);
  });

  it("refuse un producteur inactif, inconnu ou d'une autre AMAP", async () => {
    for (const id of [farms.endormie!, uuidv7(), otherAmapFarm]) {
      expect(await save(newcomer, [id])).toEqual({ status: "invalid" });
    }
    expect(await isReferent(newcomer)).toBe(false);
  });

  it("est refusé à un référent (accès refusé)", async () => {
    await expect(inA((tx, ctx) => listRoleProducers(tx, ctx), referent.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      inA(
        (tx, ctx) => saveMemberRoles(tx, ctx, { userId: newcomer, admin: true, referentOf: [] }),
        referent.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
