import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { household, householdInvitation, householdMember, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import {
  acceptInvitation,
  cancelInvitation,
  getInvitationDetails,
  getMyHousehold,
  invitationTokenHash,
  inviteToHousehold,
  removeHouseholdMember,
  setPreferredSpace,
  updateMyProfile,
} from "@/server/my-account";
import { myHousehold } from "@/server/orders";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// « Mon profil » et « Mon foyer » (story A3), avec la vraie base et la Row Level Security.
describe("Mon profil et mon foyer (A3)", () => {
  let db: TestDatabase;
  let amapA: { id: string; slug: string; name: string };
  let amapB: { id: string };
  let claire: { id: string; email: string };
  let thomas: { id: string; email: string };
  let outsider: { id: string; email: string };
  let other: { id: string; email: string };
  let homeId: string;

  const ctxOf = (userId: string | null, amapId: string | null = amapA.id): AmapContext => ({
    amapId,
    userId,
  });
  const run = <T>(
    userId: string,
    fn: Parameters<typeof withAmapContext<T>>[2],
    amapId: string | null = amapA.id,
  ) => withAmapContext(db.app, ctxOf(userId, amapId), fn);

  const addHome = async (amapId: string, name: string, members: string[]) => {
    const id = uuidv7();
    await db.owner.insert(household).values({ id, amapId, name });
    await db.owner
      .insert(householdMember)
      .values(
        members.map((userId, i) => ({ amapId, householdId: id, userId, isPrimary: i === 0 })),
      );
    return id;
  };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a3");
    amapB = await f.createAmap("amap-a3-autre");
    claire = await f.createUser({ firstName: "Claire", lastName: "Fournier" });
    thomas = await f.createUser({ firstName: "Thomas", lastName: "Fournier" });
    outsider = await f.createUser({ firstName: "Sans", lastName: "Foyer" });
    other = await f.createUser({ firstName: "Autre", lastName: "Foyer" });
    homeId = await addHome(amapA.id, "Foyer Fournier", [claire.id, thomas.id]);
    await addHome(amapA.id, "Foyer Autre", [other.id]);
  });

  describe("mes informations", () => {
    it("enregistre prénom, nom et téléphone au format international", async () => {
      const result = await run(claire.id, (tx, ctx) =>
        updateMyProfile(tx, ctx, {
          firstName: " Claire ",
          lastName: "Fournier",
          phone: "06 12 34 56 78",
        }),
      );
      expect(result).toEqual({ status: "saved" });
      const [row] = await db.owner.select().from(user).where(eq(user.id, claire.id));
      expect(row).toMatchObject({
        firstName: "Claire",
        phone: "+33612345678",
        email: claire.email,
      });
    });

    it("refuse un téléphone invalide ou un prénom vide, sans rien enregistrer", async () => {
      expect(
        await run(claire.id, (tx, ctx) =>
          updateMyProfile(tx, ctx, { firstName: "Claire", lastName: "", phone: "12" }),
        ),
      ).toEqual({ status: "invalid", fields: ["phone"] });
      expect(
        await run(claire.id, (tx, ctx) =>
          updateMyProfile(tx, ctx, { firstName: "", lastName: "", phone: "" }),
        ),
      ).toEqual({ status: "invalid", fields: ["firstName"] });
      const [row] = await db.owner.select().from(user).where(eq(user.id, claire.id));
      expect(row?.phone).toBe("+33612345678");
    });

    it("mémorise un mode qui est bien un espace du compte", async () => {
      const spaces = [
        { amapSlug: "amap-a3", amapName: "A", kind: "famille" as const },
        { amapSlug: "amap-a3", amapName: "A", kind: "admin" as const },
      ];
      expect(
        await run(
          claire.id,
          (tx, ctx) => setPreferredSpace(tx, ctx, "amap-a3/admin", spaces),
          null,
        ),
      ).toEqual({ status: "saved", path: "/amap-a3/admin" });
      expect(
        await run(
          claire.id,
          (tx, ctx) => setPreferredSpace(tx, ctx, "amap-a3/referent", spaces),
          null,
        ),
      ).toEqual({ status: "invalid" });
      const [row] = await db.owner.select().from(user).where(eq(user.id, claire.id));
      expect(row?.preferredSpace).toBe("amap-a3/admin");
    });
  });

  describe("inviter dans mon foyer", () => {
    let token: string;

    it("un membre invite une personne : lien de 7 jours, compte créé vide (accès autorisé)", async () => {
      const now = new Date("2026-11-26T10:00:00Z");
      const result = await run(claire.id, (tx, ctx) =>
        inviteToHousehold(tx, ctx, { email: " Lea.Fournier@Example.org " }, now),
      );
      expect(result).toMatchObject({
        status: "invited",
        email: "lea.fournier@example.org",
        householdName: "Foyer Fournier",
        inviterName: "Claire Fournier",
      });
      if (result.status !== "invited") return;
      token = result.token;
      const [created] = await db.owner
        .select()
        .from(user)
        .where(eq(user.email, "lea.fournier@example.org"));
      expect(created).toMatchObject({ firstName: "", lastName: "" });
      // La base ne garde que l'empreinte du jeton.
      const [inv] = await db.owner.select().from(householdInvitation);
      expect(inv?.tokenHash).toBe(invitationTokenHash(token));
      expect(inv?.tokenHash).not.toBe(token);
      expect(inv?.expiresAt).toEqual(new Date("2026-12-03T10:00:00Z"));
    });

    it("refuse : sans foyer, soi-même, un membre, une invitation déjà en cours (accès refusé)", async () => {
      const invite = (userId: string, email: string) =>
        run(userId, (tx, ctx) => inviteToHousehold(tx, ctx, { email }));
      expect(await invite(outsider.id, "x@example.org")).toEqual({ status: "no_household" });
      expect(await invite(claire.id, claire.email)).toEqual({ status: "self" });
      expect(await invite(claire.id, thomas.email)).toEqual({ status: "already_member" });
      expect(await invite(claire.id, "lea.fournier@example.org")).toEqual({
        status: "already_invited",
      });
      expect(await invite(claire.id, "pas-un-email")).toEqual({ status: "invalid" });
    });

    it("montre l'invitation au foyer, pas aux autres foyers", async () => {
      const mine = await run(thomas.id, (tx, ctx) => getMyHousehold(tx, ctx, amapA));
      expect(mine?.invitations.map((i) => i.email)).toEqual(["lea.fournier@example.org"]);
      expect(mine?.members.map((m) => [m.firstName, m.isPrimary])).toEqual([
        ["Claire", true],
        ["Thomas", false],
      ]);
      const seen = await run(other.id, (tx) => tx.select().from(householdInvitation));
      expect(seen).toEqual([]);
    });

    it("acceptation : demande le prénom d'un compte neuf, puis rejoint le foyer", async () => {
      const details = await getInvitationDetails(db.app, token);
      expect(details).toEqual({
        status: "pending",
        amapSlug: "amap-a3",
        amapName: amapA.name,
        householdName: "Foyer Fournier",
        email: "lea.fournier@example.org",
        needsName: true,
      });
      expect(await acceptInvitation(db.app, { token })).toEqual({ status: "name_required" });
      const [inviterBefore] = await db.owner.select().from(user).where(eq(user.id, claire.id));
      expect(
        await acceptInvitation(db.app, { token, firstName: "Léa", lastName: "Fournier" }),
      ).toEqual({ status: "accepted" });
      // Fiche #134 : le prénom et le nom saisis vont au seul compte invité, jamais à celui de la
      // personne qui a invité (souvent connectée sur le même ordinateur).
      const [invitee] = await db.owner
        .select()
        .from(user)
        .where(eq(user.email, "lea.fournier@example.org"));
      expect(invitee).toMatchObject({ firstName: "Léa", lastName: "Fournier" });
      const [inviterAfter] = await db.owner.select().from(user).where(eq(user.id, claire.id));
      expect(inviterAfter).toMatchObject({
        firstName: inviterBefore?.firstName,
        lastName: inviterBefore?.lastName,
      });
      // Lien à usage unique.
      expect(await acceptInvitation(db.app, { token, firstName: "X" })).toEqual({
        status: "invalid",
      });
      expect(await getInvitationDetails(db.app, token)).toEqual({ status: "accepted" });
      const home = await run(claire.id, (tx, ctx) => getMyHousehold(tx, ctx, amapA));
      expect(home?.members.map((m) => m.firstName)).toEqual(["Claire", "Léa", "Thomas"]);
      expect(home?.invitations).toEqual([]);
    });

    it("refuse un lien expiré, annulé ou faux", async () => {
      const later = await run(claire.id, (tx, ctx) =>
        inviteToHousehold(tx, ctx, { email: "tard@example.org" }, new Date("2026-01-01T10:00:00Z")),
      );
      if (later.status !== "invited") throw new Error("invitation non créée");
      expect(await acceptInvitation(db.app, { token: later.token, firstName: "T" })).toEqual({
        status: "expired",
      });
      const cancelled = await run(claire.id, (tx, ctx) =>
        inviteToHousehold(tx, ctx, { email: "annule@example.org" }),
      );
      if (cancelled.status !== "invited") throw new Error("invitation non créée");
      const [row] = await db.owner
        .select({ id: householdInvitation.id })
        .from(householdInvitation)
        .where(eq(householdInvitation.email, "annule@example.org"));
      // Un autre foyer ne peut pas l'annuler ; le foyer, si.
      expect(
        await run(other.id, (tx, ctx) => cancelInvitation(tx, ctx, { invitationId: row!.id })),
      ).toEqual({ status: "not_found" });
      expect(
        await run(thomas.id, (tx, ctx) => cancelInvitation(tx, ctx, { invitationId: row!.id })),
      ).toEqual({ status: "cancelled" });
      expect(await acceptInvitation(db.app, { token: cancelled.token, firstName: "A" })).toEqual({
        status: "invalid",
      });
      expect(await acceptInvitation(db.app, { token: "faux-jeton-faux-jeton" })).toEqual({
        status: "invalid",
      });
    });

    it("refuse une personne déjà dans un autre foyer de l'AMAP", async () => {
      const result = await run(claire.id, (tx, ctx) =>
        inviteToHousehold(tx, ctx, { email: other.email }),
      );
      if (result.status !== "invited") throw new Error("invitation non créée");
      expect(await acceptInvitation(db.app, { token: result.token })).toEqual({
        status: "already_member",
      });
    });
  });

  describe("retirer un membre", () => {
    it("refuse de se retirer soi-même, ou une personne d'un autre foyer (accès refusé)", async () => {
      const remove = (by: string, target: string) =>
        run(by, (tx, ctx) => removeHouseholdMember(tx, ctx, { userId: target }));
      expect(await remove(claire.id, claire.id)).toEqual({ status: "self" });
      expect(await remove(claire.id, other.id)).toEqual({ status: "not_found" });
      expect(await remove(outsider.id, thomas.id)).toEqual({ status: "forbidden" });
    });

    it("retire un membre : il ne voit plus le foyer, son compte reste (accès autorisé)", async () => {
      // Thomas retire Claire, contact principal : Thomas le devient.
      expect(
        await run(thomas.id, (tx, ctx) => removeHouseholdMember(tx, ctx, { userId: claire.id })),
      ).toEqual({
        status: "removed",
        email: claire.email,
        firstName: "Claire",
        householdName: "Foyer Fournier",
      });
      expect(await run(claire.id, (tx, ctx) => myHousehold(tx, ctx))).toBeNull();
      const members = await db.owner
        .select({
          userId: householdMember.userId,
          isPrimary: householdMember.isPrimary,
          archivedAt: householdMember.archivedAt,
        })
        .from(householdMember)
        .where(eq(householdMember.householdId, homeId));
      expect(members.find((m) => m.userId === thomas.id)?.isPrimary).toBe(true);
      expect(members.find((m) => m.userId === claire.id)?.archivedAt).not.toBeNull();
      expect(await db.owner.select().from(user).where(eq(user.id, claire.id))).toHaveLength(1);
    });
  });

  it("isole les invitations entre AMAP", async () => {
    const inB = await run(thomas.id, (tx) => tx.select().from(householdInvitation), amapB.id);
    expect(inB).toEqual([]);
  });
});
