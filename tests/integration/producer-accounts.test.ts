import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { auditLog, household, householdMember, producer, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError } from "@/server/auth/errors";
import { anonymizeHousehold } from "@/server/households";
import {
  createProducer,
  getAmapProducer,
  inviteProducerAccount,
  listAmapProducers,
  listMyProducers,
  producerInvitationFor,
  setProducerReferents,
  updateMyProducer,
} from "@/server/producers";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Comptes producteurs et fiche producteur du référent (story C1, partie 2).
describe("Comptes producteurs et « Mes producteurs » (C1)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let otherReferent: { id: string };
  let mine: string; // producteur suivi par `referent`
  let notMine: string; // producteur suivi par `otherReferent`

  const as = (userId: string, amapId: string): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor = admin.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);

  const newProducer = async (name: string, referentId: string) => {
    const result = await inA((tx, ctx) => createProducer(tx, ctx, { name, checkPayee: name }));
    if (result.status !== "saved") throw new Error(result.status);
    await inA((tx, ctx) =>
      setProducerReferents(tx, ctx, {
        amapProducerId: result.amapProducerId,
        userIds: [referentId],
      }),
    );
    return result.amapProducerId;
  };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser({ firstName: "Alix" });
    referent = await f.createUser({ firstName: "Robin" });
    otherReferent = await f.createUser({ firstName: "Lou" });
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");
    mine = await newProducer("Ruches d'essai", referent.id);
    notMine = await newProducer("Laiterie d'essai", otherReferent.id);
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  describe("comptes producteurs", () => {
    it("affiche « pas de compte », puis invite un compte : « invitation envoyée »", async () => {
      const before = await inA((tx, ctx) => listAmapProducers(tx, ctx));
      expect(before.find((p) => p.id === mine)?.access).toBe("none");

      const result = await inA((tx, ctx) =>
        inviteProducerAccount(tx, ctx, {
          amapProducerId: mine,
          email: "Apiculteur@Example.org",
          firstName: "Camille",
          lastName: "Miel",
        }),
      );
      expect(result).toEqual({
        status: "invited",
        invitation: {
          userId: expect.any(String),
          email: "apiculteur@example.org",
          firstName: "Camille",
          producerName: "Ruches d'essai",
        },
      });
      const detail = await inA((tx, ctx) => getAmapProducer(tx, ctx, mine));
      expect(detail?.access).toBe("invited");
      expect(detail?.accounts.map((a) => [a.email, a.status])).toEqual([
        ["apiculteur@example.org", "invited"],
      ]);
      const entries = await db.owner.select().from(auditLog).where(eq(auditLog.entityId, mine));
      expect(entries.map((e) => e.action)).toContain("invite_account");
    });

    it("refuse un deuxième rattachement du même compte, et propose de renvoyer l'invitation", async () => {
      expect(
        await inA((tx, ctx) =>
          inviteProducerAccount(tx, ctx, {
            amapProducerId: mine,
            email: "apiculteur@example.org",
            firstName: "Camille",
          }),
        ),
      ).toEqual({ status: "already" });
      const detail = await inA((tx, ctx) => getAmapProducer(tx, ctx, mine));
      const userId = detail!.accounts[0]!.userId;
      expect(
        await inA((tx, ctx) => producerInvitationFor(tx, ctx, { amapProducerId: mine, userId })),
      ).toMatchObject({ email: "apiculteur@example.org", producerName: "Ruches d'essai" });
    });

    it("passe à « compte actif » après la première connexion", async () => {
      await db.owner
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.email, "apiculteur@example.org"));
      const detail = await inA((tx, ctx) => getAmapProducer(tx, ctx, mine));
      expect(detail?.access).toBe("active");
    });

    it("laisse le producteur lire sa propre fiche, hors de toute AMAP", async () => {
      const [account] = await db.owner
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, "apiculteur@example.org"));
      const seen = await withAmapContext(db.app, { amapId: null, userId: account!.id }, (tx) =>
        tx.select({ name: producer.name }).from(producer),
      );
      expect(seen).toEqual([{ name: "Ruches d'essai" }]);
    });

    it("garde actif, à l'anonymisation d'un foyer, un compte lié à un producteur", async () => {
      const [account] = await db.owner
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, "apiculteur@example.org"));
      const householdId = uuidv7();
      await db.owner
        .insert(household)
        .values({ id: householdId, amapId: amapA.id, name: "Foyer Miel" });
      await db.owner
        .insert(householdMember)
        .values({ amapId: amapA.id, householdId, userId: account!.id, isPrimary: true });
      const result = await inA((tx, ctx) =>
        anonymizeHousehold(tx, ctx, { householdId, confirmName: "Foyer Miel" }),
      );
      expect(result).toEqual({ status: "anonymized", anonymizedUserIds: [] });
    });

    it("réserve l'invitation aux admins", async () => {
      await expect(
        inA(
          (tx, ctx) =>
            inviteProducerAccount(tx, ctx, {
              amapProducerId: mine,
              email: "x@example.org",
              firstName: "X",
            }),
          referent.id,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("« Mes producteurs » du référent", () => {
    it("ne liste que les producteurs dont le référent a la charge", async () => {
      const list = await inA((tx, ctx) => listMyProducers(tx, ctx), referent.id);
      expect(list.map((p) => p.name)).toEqual(["Ruches d'essai"]);
    });

    it("laisse le référent modifier coordonnées et ordre des chèques de son producteur", async () => {
      const result = await inA(
        (tx, ctx) =>
          updateMyProducer(tx, ctx, {
            amapProducerId: mine,
            name: "Ruches d'essai",
            phone: "06 39 98 00 70",
            checkPayee: "EARL des Ruches",
          }),
        referent.id,
      );
      expect(result).toEqual({ status: "saved", amapProducerId: mine });
      const [row] = await inA((tx, ctx) => listMyProducers(tx, ctx), referent.id);
      expect(row).toMatchObject({ phone: "+33639980070", checkPayee: "EARL des Ruches" });
    });

    it("refuse au référent un producteur qu'il ne suit pas (application et base)", async () => {
      expect(
        await inA(
          (tx, ctx) =>
            updateMyProducer(tx, ctx, {
              amapProducerId: notMine,
              name: "Piraté",
              checkPayee: "Pirate",
            }),
          referent.id,
        ),
      ).toEqual({ status: "not_found" });
      // Même en écrivant directement : la RLS ne laisse pas modifier ce producteur.
      const detail = await inA((tx, ctx) => getAmapProducer(tx, ctx, notMine));
      const updated = await inA(
        (tx) =>
          tx
            .update(producer)
            .set({ name: "Piraté" })
            .where(eq(producer.id, detail!.producerId))
            .returning({ id: producer.id }),
        referent.id,
      );
      expect(updated).toEqual([]);
    });

    it("refuse « Mes producteurs » à une personne sans rôle référent", async () => {
      const amapien = await fixtures(db.owner).createUser({ email: "sansrole@example.org" });
      await expect(inA((tx, ctx) => listMyProducers(tx, ctx), amapien.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      // Référent seulement dans l'AMAP B : rien à voir dans l'AMAP A non plus.
      await fixtures(db.owner).grantRole(amapB.id, amapien.id, "referent");
      await expect(inA((tx, ctx) => listMyProducers(tx, ctx), amapien.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });
});
