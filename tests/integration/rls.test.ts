import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext } from "@/db/context";
import { amap, amapRole, auditLog, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { expectDatabaseError } from "./helpers/errors";
import { fixtures } from "./helpers/fixtures";

// Isolation entre AMAP garantie par PostgreSQL (Row Level Security), avec la connexion
// de l'application (rôle pomme_app), comme en production.
describe("Isolation des données par AMAP (RLS)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let aliceA: { id: string }; // administratrice de l'AMAP A
  let bobB: { id: string }; // administrateur de l'AMAP B

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    aliceA = await f.createUser({ email: "alice@example.org" });
    bobB = await f.createUser({ email: "bob@example.org" });
    await f.grantRole(amapA.id, aliceA.id, "admin");
    await f.grantRole(amapB.id, bobB.id, "admin");
    await db.owner.insert(auditLog).values({
      id: uuidv7(),
      amapId: amapB.id,
      actorUserId: bobB.id,
      entityType: "amap",
      entityId: amapB.id,
      action: "update",
    });
  });

  afterAll(async () => {
    await db?.stop();
  });

  const asAlice = () => ({ amapId: amapA.id, userId: aliceA.id });

  describe("lecture", () => {
    it("ne montre que les rôles de l'AMAP courante", async () => {
      const rows = await withAmapContext(db.app, asAlice(), (tx) => tx.select().from(amapRole));
      expect(rows.map((r) => r.amapId)).toEqual([amapA.id]);
    });

    it("ne montre pas les membres d'une autre AMAP", async () => {
      const rows = await withAmapContext(db.app, asAlice(), (tx) => tx.select().from(user));
      expect(rows.map((r) => r.id)).toEqual([aliceA.id]);
    });

    it("ne montre pas le journal d'une autre AMAP", async () => {
      const rows = await withAmapContext(db.app, asAlice(), (tx) => tx.select().from(auditLog));
      expect(rows).toEqual([]);
    });

    it("ne montre rien sans contexte (requête hors withAmapContext)", async () => {
      expect(await db.app.select().from(amapRole)).toEqual([]);
      expect(await db.app.select().from(user)).toEqual([]);
    });

    it("laisse lire les informations publiques de toutes les AMAP", async () => {
      const rows = await withAmapContext(db.app, asAlice(), (tx) => tx.select().from(amap));
      expect(rows.map((r) => r.slug).sort()).toEqual(["amap-a", "amap-b"]);
    });
  });

  describe("écriture", () => {
    it("refuse d'ajouter un rôle dans une autre AMAP", async () => {
      await expectDatabaseError(
        withAmapContext(db.app, asAlice(), (tx) =>
          tx
            .insert(amapRole)
            .values({ id: uuidv7(), amapId: amapB.id, userId: aliceA.id, role: "admin" }),
        ),
        /row-level security/,
      );
    });

    it("ne modifie ni ne supprime les rôles d'une autre AMAP", async () => {
      const updated = await withAmapContext(db.app, asAlice(), (tx) =>
        tx
          .update(amapRole)
          .set({ role: "referent" })
          .where(eq(amapRole.amapId, amapB.id))
          .returning(),
      );
      const deleted = await withAmapContext(db.app, asAlice(), (tx) =>
        tx.delete(amapRole).where(eq(amapRole.amapId, amapB.id)).returning(),
      );
      expect(updated).toEqual([]);
      expect(deleted).toEqual([]);
      const stillThere = await db.owner
        .select()
        .from(amapRole)
        .where(eq(amapRole.amapId, amapB.id));
      expect(stillThere.map((r) => r.role)).toEqual(["admin"]);
    });

    it("ne modifie pas une autre AMAP", async () => {
      const updated = await withAmapContext(db.app, asAlice(), (tx) =>
        tx.update(amap).set({ name: "Piratée" }).where(eq(amap.id, amapB.id)).returning(),
      );
      expect(updated).toEqual([]);
    });

    it("ne modifie pas le compte d'une autre personne", async () => {
      const updated = await withAmapContext(db.app, asAlice(), (tx) =>
        tx.update(user).set({ firstName: "Piraté" }).where(eq(user.id, bobB.id)).returning(),
      );
      expect(updated).toEqual([]);
    });

    it("empêche de se déclarer gestionnaire de la plateforme", async () => {
      await expectDatabaseError(
        withAmapContext(db.app, asAlice(), (tx) =>
          tx.update(user).set({ isPlatformAdmin: true }).where(eq(user.id, aliceA.id)),
        ),
        /row-level security/,
      );
    });

    it("refuse de créer une AMAP avec la connexion de l'application", async () => {
      await expectDatabaseError(
        withAmapContext(db.app, asAlice(), (tx) =>
          tx.insert(amap).values({ id: uuidv7(), slug: "nouvelle", name: "Nouvelle" }),
        ),
        /row-level security/,
      );
    });

    it("refuse d'écrire dans le journal d'une autre AMAP ou au nom d'un autre", async () => {
      const entry = { entityType: "amap", entityId: amapA.id, action: "update" };
      await expectDatabaseError(
        withAmapContext(db.app, asAlice(), (tx) =>
          tx
            .insert(auditLog)
            .values({ id: uuidv7(), amapId: amapB.id, actorUserId: aliceA.id, ...entry }),
        ),
        /row-level security/,
      );
      await expectDatabaseError(
        withAmapContext(db.app, asAlice(), (tx) =>
          tx
            .insert(auditLog)
            .values({ id: uuidv7(), amapId: amapA.id, actorUserId: bobB.id, ...entry }),
        ),
        /row-level security/,
      );
    });

    it("ne laisse ni modifier ni effacer le journal", async () => {
      const result = await withAmapContext(
        db.app,
        { amapId: amapB.id, userId: bobB.id },
        async (tx) => ({
          updated: await tx.update(auditLog).set({ action: "effacé" }).returning(),
          deleted: await tx.delete(auditLog).returning(),
        }),
      );
      expect(result).toEqual({ updated: [], deleted: [] });
    });
  });

  describe("le rôle de l'application ne peut pas contourner la RLS", () => {
    it("n'est ni superutilisateur ni dispensé de RLS", async () => {
      const result = await db.app.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
        sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
      );
      expect(result.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    });

    it("ne peut pas désactiver la RLS d'une table", async () => {
      await expectDatabaseError(
        db.app.execute(sql`alter table amap_role disable row level security`),
        /must be owner/,
      );
    });

    it("ne peut pas supprimer une politique", async () => {
      await expectDatabaseError(
        db.app.execute(sql`drop policy amap_role_isolation on amap_role`),
        /must be owner/,
      );
    });

    it("ne peut pas couper la RLS pour sa session", async () => {
      await expectDatabaseError(
        db.app.transaction(async (tx) => {
          await tx.execute(sql`set local row_security = off`);
          await tx.select().from(amapRole);
        }),
        /row-level security/,
      );
    });

    it("ne peut pas créer de table", async () => {
      await expectDatabaseError(
        db.app.execute(sql`create table piratage (id int)`),
        /permission denied/,
      );
    });
  });
});
