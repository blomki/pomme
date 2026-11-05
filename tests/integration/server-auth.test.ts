import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext } from "@/db/context";
import { amap, auditLog } from "@/db/schema";
import { writeAuditLog } from "@/server/audit";
import { ForbiddenError, UnauthenticatedError } from "@/server/auth/errors";
import { requireRole } from "@/server/auth/require-role";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

describe("requireRole et journal", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    referent = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapB.id, referent.id, "admin"); // admin ailleurs, référent ici
  });

  afterAll(async () => {
    await db?.stop();
  });

  describe("requireRole", () => {
    it("laisse passer un utilisateur qui a le rôle demandé", async () => {
      const roles = await withAmapContext(
        db.app,
        { amapId: amapA.id, userId: admin.id },
        (tx, ctx) => requireRole(tx, ctx, ["admin"]),
      );
      expect(roles).toEqual(["admin"]);
    });

    it("refuse un utilisateur qui n'a pas le rôle demandé", async () => {
      await expect(
        withAmapContext(db.app, { amapId: amapA.id, userId: referent.id }, (tx, ctx) =>
          requireRole(tx, ctx, ["admin"]),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("ne tient pas compte des rôles dans une autre AMAP", async () => {
      // Le référent est administrateur de l'AMAP B, mais pas de l'AMAP A.
      await expect(
        withAmapContext(db.app, { amapId: amapA.id, userId: referent.id }, (tx, ctx) =>
          requireRole(tx, ctx, ["admin"]),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("refuse un visiteur non connecté", async () => {
      await expect(
        withAmapContext(db.app, { amapId: amapA.id, userId: null }, (tx, ctx) =>
          requireRole(tx, ctx, ["admin", "referent"]),
        ),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it("refuse une action sans AMAP courante", async () => {
      await expect(
        withAmapContext(db.app, { amapId: null, userId: admin.id }, (tx, ctx) =>
          requireRole(tx, ctx, ["admin"]),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("writeAuditLog", () => {
    it("écrit l'action et son journal ensemble", async () => {
      await withAmapContext(db.app, { amapId: amapA.id, userId: admin.id }, async (tx, ctx) => {
        await requireRole(tx, ctx, ["admin"]);
        await tx.update(amap).set({ name: "AMAP A renommée" }).where(eq(amap.id, amapA.id));
        await writeAuditLog(tx, ctx, {
          entityType: "amap",
          entityId: amapA.id,
          action: "update",
          before: { name: "AMAP amap-a" },
          after: { name: "AMAP A renommée" },
        });
      });
      const entries = await db.owner
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, amapA.id));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorUserId: admin.id, action: "update" });
    });

    it("annule le journal si l'action échoue, et l'action si le journal échoue", async () => {
      const before = await db.owner.select().from(auditLog);
      await expect(
        withAmapContext(db.app, { amapId: amapA.id, userId: admin.id }, async (tx, ctx) => {
          await tx.update(amap).set({ name: "Jamais enregistré" }).where(eq(amap.id, amapA.id));
          await writeAuditLog(tx, ctx, { entityType: "amap", entityId: amapA.id, action: "x" });
          throw new Error("échec de l'action");
        }),
      ).rejects.toThrow("échec de l'action");

      const after = await db.owner.select().from(auditLog);
      const [current] = await db.owner.select().from(amap).where(eq(amap.id, amapA.id));
      expect(after).toHaveLength(before.length);
      expect(current?.name).not.toBe("Jamais enregistré");
    });
  });
});
