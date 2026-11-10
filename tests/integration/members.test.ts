import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext } from "@/db/context";
import { auditLog, user } from "@/db/schema";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import { correctMemberEmail, listAmapMembers } from "@/server/members";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Correction de l'email d'un membre par un admin (story A1).
describe("Membres et correction d'email", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string; email: string };
  let otherAmapMember: { id: string };
  let platformAdmin: { id: string };

  const as = (userId: string, amapId: string, verified = true) => ({
    amapId,
    userId,
    secondFactorVerified: verified,
  });

  const correct = (actor: string, input: { userId: unknown; email: unknown }, verified = true) =>
    withAmapContext(db.app, as(actor, amapA.id, verified), (tx, ctx) =>
      correctMemberEmail(tx, ctx, input),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser({ firstName: "Alix" });
    referent = await f.createUser({ email: "ancienne@example.org", emailVerified: true });
    otherAmapMember = await f.createUser();
    platformAdmin = await f.createUser({ isPlatformAdmin: true });
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapB.id, otherAmapMember.id, "referent");
    await f.grantRole(amapA.id, platformAdmin.id, "referent");
  });

  afterAll(async () => {
    await db?.stop();
  });

  it("liste les membres de l'AMAP courante seulement, pour un admin", async () => {
    const members = await withAmapContext(db.app, as(admin.id, amapA.id), (tx, ctx) =>
      listAmapMembers(tx, ctx),
    );
    const ids = members.map((member) => member.id);
    expect(ids).toContain(referent.id);
    expect(ids).not.toContain(otherAmapMember.id);
  });

  it("refuse la liste à un référent", async () => {
    await expect(
      withAmapContext(db.app, as(referent.id, amapA.id), (tx, ctx) => listAmapMembers(tx, ctx)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("corrige l'email d'un membre, et l'inscrit au journal", async () => {
    const result = await correct(admin.id, {
      userId: referent.id,
      email: "  Nouvelle@Example.org ",
    });
    expect(result).toEqual({ status: "corrected", userId: referent.id });

    const [row] = await db.owner.select().from(user).where(eq(user.id, referent.id));
    expect(row?.email).toBe("nouvelle@example.org");
    expect(row?.emailVerified).toBe(false);

    const [entry] = await db.owner
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, referent.id), eq(auditLog.action, "correct_email")));
    expect(entry?.actorUserId).toBe(admin.id);
    expect(entry?.before).toEqual({ email: "ancienne@example.org" });
    expect(entry?.after).toEqual({ email: "nouvelle@example.org" });
  });

  it("refuse un référent (accès refusé)", async () => {
    await expect(
      correct(referent.id, { userId: admin.id, email: "pirate@example.org" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuse un admin qui n'a pas fait la deuxième vérification", async () => {
    await expect(
      correct(admin.id, { userId: referent.id, email: "autre@example.org" }, false),
    ).rejects.toBeInstanceOf(SecondFactorRequiredError);
  });

  it("refuse de toucher à une personne d'une autre AMAP", async () => {
    expect(await correct(admin.id, { userId: otherAmapMember.id, email: "x@example.org" })).toEqual(
      { status: "forbidden" },
    );
  });

  it("refuse de toucher au compte d'un gestionnaire de la plateforme", async () => {
    expect(await correct(admin.id, { userId: platformAdmin.id, email: "x@example.org" })).toEqual({
      status: "forbidden",
    });
  });

  it("refuse une adresse déjà prise, invalide ou inchangée", async () => {
    const [adminRow] = await db.owner.select().from(user).where(eq(user.id, admin.id));
    expect(await correct(admin.id, { userId: referent.id, email: adminRow?.email })).toEqual({
      status: "taken",
    });
    expect(await correct(admin.id, { userId: referent.id, email: "pas-une-adresse" })).toEqual({
      status: "invalid",
    });
    expect(await correct(admin.id, { userId: referent.id, email: "nouvelle@example.org" })).toEqual(
      { status: "same" },
    );
  });

  it("empêche aussi, au niveau de la base, de modifier un compte d'une autre AMAP", async () => {
    const updated = await withAmapContext(db.app, as(admin.id, amapA.id), (tx) =>
      tx
        .update(user)
        .set({ email: "detourne@example.org" })
        .where(eq(user.id, otherAmapMember.id))
        .returning({ id: user.id }),
    );
    expect(updated).toEqual([]);
  });
});
