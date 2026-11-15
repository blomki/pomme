import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { amapRole, auditLog, household, householdMember, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import {
  addHouseholdMember,
  anonymizeHousehold,
  createHousehold,
  exportHousehold,
  getHousehold,
  invitationFor,
  listHouseholds,
  setHouseholdArchived,
  setMemberRole,
  setPrimaryContact,
} from "@/server/households";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Foyers, membres, rôles et archivage (story A2), avec la vraie base et la RLS.
describe("Foyers (A2)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let elsewhere: { id: string; email: string };

  const as = (userId: string, amapId: string, verified = true): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: verified,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor = admin.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);

  const newHousehold = (name: string, members: Array<Record<string, unknown>>) =>
    inA((tx, ctx) => createHousehold(tx, ctx, { name, members }));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser({ firstName: "Alix" });
    referent = await f.createUser();
    // Personne inscrite seulement dans l'AMAP B, avec son propre profil.
    elsewhere = await f.createUser({
      email: "deja@example.org",
      firstName: "Dominique",
      phone: "+33639980001",
    });
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapB.id, elsewhere.id, "referent");
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  describe("création", () => {
    it("crée le foyer, un compte pour une nouvelle personne, et l'inscrit au journal", async () => {
      const result = await newHousehold("  Foyer   Martin ", [
        {
          email: "Martin@Example.org",
          firstName: "Claude",
          lastName: "Martin",
          phone: "06 39 98 00 02",
          isPrimary: true,
        },
      ]);
      expect(result.status).toBe("created");
      if (result.status !== "created") return;
      expect(result.invitations).toEqual([
        { userId: expect.any(String), email: "martin@example.org", firstName: "Claude" },
      ]);

      const [row] = await db.owner
        .select()
        .from(household)
        .where(eq(household.id, result.householdId));
      expect(row?.name).toBe("Foyer Martin");
      const [account] = await db.owner
        .select()
        .from(user)
        .where(eq(user.email, "martin@example.org"));
      expect(account?.phone).toBe("+33639980002");
      const entries = await db.owner
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, result.householdId));
      expect(entries.map((e) => e.action)).toEqual(["create"]);
    });

    it("rattache une personne déjà inscrite ailleurs à son compte unique, sans toucher son profil", async () => {
      const result = await newHousehold("Foyer Dominique", [
        {
          email: "deja@example.org",
          firstName: "Autre",
          lastName: "Nom",
          phone: "0102030405",
          isPrimary: true,
        },
      ]);
      expect(result.status).toBe("created");
      if (result.status !== "created") return;
      expect(result.invitations[0]).toMatchObject({ userId: elsewhere.id, firstName: "Dominique" });

      const accounts = await db.owner.select().from(user).where(eq(user.email, "deja@example.org"));
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({ firstName: "Dominique", phone: "+33639980001" });
    });

    it("refuse un nom déjà pris dans l'AMAP, sans tenir compte des majuscules", async () => {
      const result = await newHousehold("foyer martin", [
        { email: "autre1@example.org", firstName: "A", isPrimary: true },
      ]);
      expect(result).toEqual({ status: "name_taken" });
    });

    it("refuse une personne déjà dans un foyer de l'AMAP, sans rien créer", async () => {
      const result = await newHousehold("Foyer Doublon", [
        { email: "nouvelle@example.org", firstName: "N", isPrimary: true },
        { email: "martin@example.org", firstName: "Claude" },
      ]);
      expect(result).toEqual({ status: "member_taken", email: "martin@example.org" });
      const created = await db.owner
        .select()
        .from(user)
        .where(eq(user.email, "nouvelle@example.org"));
      expect(created).toHaveLength(0);
      const named = await db.owner
        .select()
        .from(household)
        .where(eq(household.name, "Foyer Doublon"));
      expect(named).toHaveLength(0);
    });

    it("signale les champs invalides et les règles du foyer", async () => {
      const invalid = await newHousehold("Foyer Test", [
        { email: "pas-un-email", firstName: "", phone: "12", isPrimary: true },
      ]);
      expect(invalid.status).toBe("invalid");
      if (invalid.status === "invalid") {
        expect(invalid.errors).toEqual(
          expect.arrayContaining([
            { member: 0, field: "email" },
            { member: 0, field: "firstName" },
            { member: 0, field: "phone" },
          ]),
        );
      }
      expect(await newHousehold("Foyer Test", [])).toEqual({ status: "no_member" });
      expect(
        await newHousehold("Foyer Test", [{ email: "x@example.org", firstName: "X" }]),
      ).toEqual({ status: "primary_count" });
    });

    it("est refusée à un référent, et à un admin sans deuxième vérification", async () => {
      await expect(
        inA((tx, ctx) => createHousehold(tx, ctx, { name: "X", members: [] }), referent.id),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        withAmapContext(db.app, as(admin.id, amapA.id, false), (tx, ctx) =>
          createHousehold(tx, ctx, { name: "X", members: [] }),
        ),
      ).rejects.toBeInstanceOf(SecondFactorRequiredError);
    });
  });

  describe("lecture et isolation", () => {
    let foreignHouseholdId: string;

    beforeAll(async () => {
      foreignHouseholdId = uuidv7();
      await db.owner
        .insert(household)
        .values({ id: foreignHouseholdId, amapId: amapB.id, name: "Foyer B" });
      await db.owner.insert(householdMember).values({
        amapId: amapB.id,
        householdId: foreignHouseholdId,
        userId: elsewhere.id,
        isPrimary: true,
      });
    });

    it("liste les foyers de l'AMAP courante avec leurs membres et leur statut", async () => {
      const list = await inA((tx, ctx) => listHouseholds(tx, ctx));
      expect(list.map((h) => h.name)).toEqual(["Foyer Dominique", "Foyer Martin"]);
      const martin = list.find((h) => h.name === "Foyer Martin");
      expect(martin?.members[0]).toMatchObject({
        firstName: "Claude",
        isPrimary: true,
        status: "invited",
        roles: [],
      });
    });

    it("ne montre pas un foyer d'une autre AMAP", async () => {
      expect(await inA((tx, ctx) => getHousehold(tx, ctx, foreignHouseholdId))).toBeNull();
    });

    it("refuse de rattacher un membre à un foyer d'une autre AMAP", async () => {
      await expect(
        withAmapContext(db.app, as(admin.id, amapA.id), (tx) =>
          tx.insert(householdMember).values({
            amapId: amapA.id,
            householdId: foreignHouseholdId,
            userId: admin.id,
          }),
        ),
      ).rejects.toThrow();
    });

    it("réserve la recherche de compte par email aux admins de l'AMAP courante", async () => {
      const lookup = (ctx: AmapContext) =>
        withAmapContext(db.app, ctx, (tx) =>
          tx.execute(sql`select find_user_id_by_email('deja@example.org') as id`),
        );
      const found = await lookup(as(admin.id, amapA.id));
      expect(found.rows[0]).toEqual({ id: elsewhere.id });
      await expect(lookup(as(referent.id, amapA.id))).rejects.toThrow();
      await expect(lookup({ amapId: null, userId: null })).rejects.toThrow();
    });
  });

  describe("membres, contact principal et invitation", () => {
    let householdId: string;
    let first: string;

    beforeAll(async () => {
      const created = await newHousehold("Foyer Durand", [
        { email: "durand1@example.org", firstName: "Sam", isPrimary: true },
      ]);
      if (created.status !== "created") throw new Error(created.status);
      householdId = created.householdId;
      first = created.invitations[0]!.userId;
    });

    it("ajoute un membre, qui n'est pas contact principal", async () => {
      const result = await inA((tx, ctx) =>
        addHouseholdMember(tx, ctx, {
          householdId,
          member: { email: "durand2@example.org", firstName: "Alex", isPrimary: true },
        }),
      );
      expect(result.status).toBe("added");
      const view = await inA((tx, ctx) => getHousehold(tx, ctx, householdId));
      expect(view?.members.map((m) => [m.firstName, m.isPrimary])).toEqual([
        ["Sam", true],
        ["Alex", false],
      ]);
    });

    it("change de contact principal", async () => {
      const view = await inA((tx, ctx) => getHousehold(tx, ctx, householdId));
      const alex = view!.members.find((m) => m.firstName === "Alex")!;
      expect(
        await inA((tx, ctx) => setPrimaryContact(tx, ctx, { householdId, userId: alex.userId })),
      ).toEqual({
        status: "updated",
      });
      const after = await inA((tx, ctx) => getHousehold(tx, ctx, householdId));
      expect(after?.members.filter((m) => m.isPrimary).map((m) => m.firstName)).toEqual(["Alex"]);
    });

    it("propose de renvoyer l'invitation tant que la personne ne s'est pas connectée", async () => {
      expect(
        await inA((tx, ctx) => invitationFor(tx, ctx, { householdId, userId: first })),
      ).toMatchObject({
        email: "durand1@example.org",
      });
      await db.owner.update(user).set({ emailVerified: true }).where(eq(user.id, first));
      expect(
        await inA((tx, ctx) => invitationFor(tx, ctx, { householdId, userId: first })),
      ).toBeNull();
      const view = await inA((tx, ctx) => getHousehold(tx, ctx, householdId));
      expect(view?.members.find((m) => m.userId === first)?.status).toBe("active");
    });
  });

  describe("rôles", () => {
    let member: string;

    beforeAll(async () => {
      const created = await newHousehold("Foyer Roles", [
        { email: "roles@example.org", firstName: "Rose", isPrimary: true },
      ]);
      if (created.status !== "created") throw new Error(created.status);
      member = created.invitations[0]!.userId;
    });

    const setRole = (userId: string, role: string, granted: boolean, actor = admin.id) =>
      inA((tx, ctx) => setMemberRole(tx, ctx, { userId, role, granted }), actor);

    it("attribue puis retire des rôles cumulables, et journalise chaque changement", async () => {
      expect(await setRole(member, "referent", true)).toEqual({ status: "updated" });
      expect(await setRole(member, "admin", true)).toEqual({ status: "updated" });
      expect(await setRole(member, "admin", true)).toEqual({ status: "unchanged" });
      const roles = await db.owner
        .select({ role: amapRole.role })
        .from(amapRole)
        .where(and(eq(amapRole.userId, member), eq(amapRole.amapId, amapA.id)));
      expect(roles.map((r) => r.role).sort()).toEqual(["admin", "referent"]);

      expect(await setRole(member, "referent", false)).toEqual({ status: "updated" });
      const entries = await db.owner
        .select({ action: auditLog.action, after: auditLog.after })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, "amap_role"), eq(auditLog.entityId, member)));
      expect(entries).toEqual([
        { action: "grant_role", after: { role: "referent" } },
        { action: "grant_role", after: { role: "admin" } },
        { action: "revoke_role", after: { role: "referent" } },
      ]);
    });

    it("refuse de retirer le dernier administrateur", async () => {
      expect(await setRole(member, "admin", false)).toEqual({ status: "updated" });
      expect(await setRole(admin.id, "admin", false)).toEqual({ status: "last_admin" });
    });

    it("ne touche pas une personne d'une autre AMAP", async () => {
      const outsider = await fixtures(db.owner).createUser({ email: "dehors@example.org" });
      await fixtures(db.owner).grantRole(amapB.id, outsider.id, "admin");
      expect(await setRole(outsider.id, "referent", true)).toEqual({ status: "not_found" });
    });

    it("est refusé à un référent", async () => {
      await expect(setRole(member, "admin", true, referent.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("accès refusé", () => {
    it("refuse chaque opération sur les foyers à un référent", async () => {
      const ids = { householdId: uuidv7(), userId: uuidv7() };
      const operations: Array<(tx: never, ctx: AmapContext) => Promise<unknown>> = [
        (tx: never, ctx: AmapContext) => listHouseholds(tx, ctx),
        (tx: never, ctx: AmapContext) => getHousehold(tx, ctx, ids.householdId),
        (tx: never, ctx: AmapContext) =>
          addHouseholdMember(tx, ctx, { householdId: ids.householdId, member: {} }),
        (tx: never, ctx: AmapContext) => setPrimaryContact(tx, ctx, ids),
        (tx: never, ctx: AmapContext) => invitationFor(tx, ctx, ids),
        (tx: never, ctx: AmapContext) =>
          setHouseholdArchived(tx, ctx, { householdId: ids.householdId, archived: true }),
      ];
      for (const operation of operations) {
        await expect(
          withAmapContext(db.app, as(referent.id, amapA.id), (tx, ctx) =>
            operation(tx as never, ctx),
          ),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
    });
  });

  describe("archivage", () => {
    it("archive un foyer : il quitte la liste, son nom et ses membres se libèrent", async () => {
      const created = await newHousehold("Foyer Archive", [
        { email: "archive@example.org", firstName: "Ari", isPrimary: true },
      ]);
      if (created.status !== "created") throw new Error(created.status);
      const householdId = created.householdId;

      expect(
        await inA((tx, ctx) => setHouseholdArchived(tx, ctx, { householdId, archived: true })),
      ).toEqual({
        status: "archived",
      });
      const active = await inA((tx, ctx) => listHouseholds(tx, ctx));
      expect(active.map((h) => h.name)).not.toContain("Foyer Archive");
      const archived = await inA((tx, ctx) => listHouseholds(tx, ctx, { archived: true }));
      expect(archived.map((h) => h.name)).toEqual(["Foyer Archive"]);

      // La même personne et le même nom peuvent servir à un nouveau foyer…
      const again = await newHousehold("Foyer Archive", [
        { email: "archive@example.org", firstName: "Ari", isPrimary: true },
      ]);
      expect(again.status).toBe("created");
      // … et l'ancien ne peut alors plus être rétabli.
      expect(
        await inA((tx, ctx) => setHouseholdArchived(tx, ctx, { householdId, archived: false })),
      ).toEqual({
        status: "name_taken",
      });
      const entries = await db.owner
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.entityId, householdId));
      expect(entries.map((e) => e.action)).toEqual(["create", "archive"]);
    });
  });

  describe("RGPD : export et anonymisation", () => {
    let householdId: string;
    let alone: string; // seulement dans l'AMAP A : son compte sera anonymisé
    let shared: string; // aussi dans un foyer actif de l'AMAP B : son compte est gardé

    beforeAll(async () => {
      const created = await newHousehold("Foyer Rgpd", [
        { email: "seul@example.org", firstName: "Sol", phone: "0639980099", isPrimary: true },
        { email: "partage@example.org", firstName: "Pat" },
      ]);
      if (created.status !== "created") throw new Error(created.status);
      householdId = created.householdId;
      [alone, shared] = created.invitations.map((i) => i.userId) as [string, string];

      const otherHousehold = uuidv7();
      await db.owner
        .insert(household)
        .values({ id: otherHousehold, amapId: amapB.id, name: "Foyer Pat B" });
      await db.owner.insert(householdMember).values({
        amapId: amapB.id,
        householdId: otherHousehold,
        userId: shared,
        isPrimary: true,
      });
      await fixtures(db.owner).grantRole(amapA.id, alone, "referent");
      // Trace d'une correction d'email : contient des données personnelles.
      await db.owner.insert(auditLog).values({
        amapId: amapA.id,
        actorUserId: admin.id,
        entityType: "user",
        entityId: alone,
        action: "correct_email",
        before: { email: "ancien@example.org" },
        after: { email: "seul@example.org" },
      });
    });

    it("exporte les données du foyer et inscrit l'export au journal", async () => {
      const data = await inA((tx, ctx) => exportHousehold(tx, ctx, householdId));
      expect(data?.household.name).toBe("Foyer Rgpd");
      expect(data?.amap.name).toBe("AMAP amap-a");
      expect(data?.members.map((m) => [m.email, m.phone, m.isPrimaryContact])).toEqual([
        ["seul@example.org", "+33639980099", true],
        ["partage@example.org", null, false],
      ]);
      expect(data?.history.map((h) => h.action)).toContain("create");
      const entries = await db.owner
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(and(eq(auditLog.entityId, householdId), eq(auditLog.action, "export")));
      expect(entries).toHaveLength(1);
    });

    it("refuse l'export à un référent", async () => {
      await expect(
        inA((tx, ctx) => exportHousehold(tx, ctx, householdId), referent.id),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("exige de retaper le nom du foyer, sinon ne touche à rien", async () => {
      expect(
        await inA((tx, ctx) => anonymizeHousehold(tx, ctx, { householdId, confirmName: "Autre" })),
      ).toEqual({ status: "confirmation" });
      const [row] = await db.owner.select().from(household).where(eq(household.id, householdId));
      expect(row?.name).toBe("Foyer Rgpd");
    });

    it("refuse l'anonymisation à un référent, et la fonction de base hors de son AMAP", async () => {
      await expect(
        inA(
          (tx, ctx) => anonymizeHousehold(tx, ctx, { householdId, confirmName: "Foyer Rgpd" }),
          referent.id,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
      const callIn = (actor: string, amapId: string) =>
        withAmapContext(db.app, as(actor, amapId), (tx) =>
          tx.execute(sql`select anonymize_household(${householdId})`),
        );
      await expect(callIn(referent.id, amapA.id)).rejects.toThrow();
      // Admin de l'AMAP B, foyer de l'AMAP A : refusé par la base.
      await fixtures(db.owner).grantRole(amapB.id, admin.id, "admin");
      await expect(callIn(admin.id, amapB.id)).rejects.toThrow();
    });

    it("anonymise le foyer, le compte qui n'est plus actif nulle part, et le journal", async () => {
      const result = await inA((tx, ctx) =>
        anonymizeHousehold(tx, ctx, { householdId, confirmName: "  foyer RGPD " }),
      );
      expect(result).toEqual({ status: "anonymized", anonymizedUserIds: [alone] });

      const [row] = await db.owner.select().from(household).where(eq(household.id, householdId));
      expect(row?.name).toMatch(/^Foyer anonymisé [0-9a-f]{8}$/);
      expect(row?.archivedAt).not.toBeNull();
      expect(row?.anonymizedAt).not.toBeNull();

      const [gone] = await db.owner.select().from(user).where(eq(user.id, alone));
      expect(gone).toMatchObject({
        email: `anonyme-${alone}@anonyme.invalid`,
        firstName: "Anonyme",
        lastName: "",
        phone: null,
      });
      const [kept] = await db.owner.select().from(user).where(eq(user.id, shared));
      expect(kept?.email).toBe("partage@example.org");
      // L'AMAP A ne voit plus du tout la personne gardée pour l'AMAP B.
      const visible = await inA((tx) => tx.select().from(user).where(eq(user.id, shared)));
      expect(visible).toEqual([]);

      const roles = await db.owner.select().from(amapRole).where(eq(amapRole.userId, alone));
      expect(roles).toEqual([]);

      const traces = await db.owner
        .select({ action: auditLog.action, before: auditLog.before, after: auditLog.after })
        .from(auditLog)
        .where(eq(auditLog.entityId, alone));
      const correction = traces.find((t) => t.action === "correct_email");
      expect(correction).toMatchObject({ before: { anonymise: true }, after: { anonymise: true } });
      expect(JSON.stringify(traces)).not.toContain("example.org");
    });

    it("est irréversible : ni rétablissement, ni nouvel export, ni seconde anonymisation", async () => {
      expect(
        await inA((tx, ctx) => setHouseholdArchived(tx, ctx, { householdId, archived: false })),
      ).toEqual({ status: "anonymized" });
      expect(await inA((tx, ctx) => exportHousehold(tx, ctx, householdId))).toBeNull();
      expect(
        await inA((tx, ctx) => anonymizeHousehold(tx, ctx, { householdId, confirmName: "x" })),
      ).toEqual({ status: "already_anonymized" });
    });
  });
});
