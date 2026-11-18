import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { auditLog, household, membership } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError } from "@/server/auth/errors";
import {
  archiveMembership,
  hasActiveMembership,
  listMemberships,
  membershipStates,
  saveMembership,
} from "@/server/memberships";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

const NOW = new Date("2026-11-18T10:00:00Z");

// Adhésions des foyers (story B1), avec la vraie base et la RLS.
describe("Adhésions (B1)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let householdId: string;
  let otherHouseholdId: string;

  const as = (userId: string, amapId: string): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor = admin.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);
  const save = (input: Record<string, unknown>, actor = admin.id) =>
    inA((tx, ctx) => saveMembership(tx, ctx, { householdId, fee: "", note: "", ...input }), actor);

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    referent = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    householdId = uuidv7();
    otherHouseholdId = uuidv7();
    await db.owner.insert(household).values([
      { id: householdId, amapId: amapA.id, name: "Foyer Essai" },
      { id: otherHouseholdId, amapId: amapA.id, name: "Foyer Voisin" },
    ]);
  });

  it("un admin ajoute une adhésion, journalisée (accès autorisé)", async () => {
    const result = await save({ startDate: "2026-01-01", endDate: "2026-12-31", fee: "15" });
    expect(result).toMatchObject({ status: "saved" });
    const id = (result as { id: string }).id;
    expect(await inA((tx, ctx) => listMemberships(tx, ctx, householdId))).toEqual([
      { id, startDate: "2026-01-01", endDate: "2026-12-31", feeCents: 1500, note: "" },
    ]);
    const [entry] = await db.owner
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, id), eq(auditLog.action, "create")));
    expect(entry?.actorUserId).toBe(admin.id);
  });

  it("un référent ne peut ni saisir ni lire les adhésions (accès refusé)", async () => {
    await expect(
      save({ startDate: "2027-01-01", endDate: "2027-12-31" }, referent.id),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      inA((tx, ctx) => listMemberships(tx, ctx, householdId), referent.id),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuse une saisie incohérente", async () => {
    expect(await save({ startDate: "2027-05-01", endDate: "2027-04-01", fee: "x" })).toEqual({
      status: "invalid",
      errors: ["end_before_start", "fee"],
    });
  });

  it("la base refuse deux adhésions qui se chevauchent, même d'un seul jour", async () => {
    expect(await save({ startDate: "2026-12-31", endDate: "2027-12-30" })).toEqual({
      status: "overlap",
    });
    // Le lendemain de la fin : accepté (renouvellement sans trou).
    expect(await save({ startDate: "2027-01-01", endDate: "2027-12-31" })).toMatchObject({
      status: "saved",
    });
    // Un autre foyer n'est pas concerné.
    expect(
      await inA((tx, ctx) =>
        saveMembership(tx, ctx, {
          householdId: otherHouseholdId,
          startDate: "2026-06-01",
          endDate: "2027-05-31",
        }),
      ),
    ).toMatchObject({ status: "saved" });
  });

  it("calcule le statut et le droit de commander à partir des dates", async () => {
    const states = await inA((tx, ctx) => membershipStates(tx, ctx, [householdId], NOW));
    // Renouvelée dès le 1er janvier : pas d'alerte, couverture jusqu'à fin 2027.
    expect(states.get(householdId)).toEqual({ status: "active", date: "2027-12-31" });
    expect(await inA((tx) => hasActiveMembership(tx, householdId, NOW))).toBe(true);
    expect(
      await inA((tx) => hasActiveMembership(tx, householdId, new Date("2028-02-01T10:00:00Z"))),
    ).toBe(false);
  });

  it("modifie puis archive une adhésion, ce qui libère ses dates", async () => {
    const [latest] = await inA((tx, ctx) => listMemberships(tx, ctx, householdId));
    expect(
      await save({ id: latest!.id, startDate: "2027-01-01", endDate: "2027-06-30", note: "Demi" }),
    ).toMatchObject({ status: "saved" });
    expect(await inA((tx, ctx) => archiveMembership(tx, ctx, { id: latest!.id }))).toEqual({
      status: "archived",
    });
    expect(await inA((tx, ctx) => archiveMembership(tx, ctx, { id: latest!.id }))).toEqual({
      status: "not_found",
    });
    // Dates libérées : une nouvelle adhésion peut les reprendre.
    expect(await save({ startDate: "2027-01-01", endDate: "2027-12-31" })).toMatchObject({
      status: "saved",
    });
  });

  it("isole les AMAP : rien n'est visible ni modifiable depuis une autre AMAP", async () => {
    const seen = await withAmapContext(db.app, as(admin.id, amapB.id), (tx) =>
      tx.select().from(membership),
    );
    expect(seen).toEqual([]);
    // Une adhésion de l'AMAP B ne peut pas viser un foyer de l'AMAP A (clé composée).
    await expect(
      db.owner.insert(membership).values({
        amapId: amapB.id,
        householdId,
        startDate: "2030-01-01",
        endDate: "2030-12-31",
      }),
    ).rejects.toThrow();
  });
});
