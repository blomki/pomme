import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { amapRole, auditLog, knownDevice, passkey, session, twoFactor, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { SecondFactorRequiredError } from "@/server/auth/errors";
import {
  clearSecondFactor,
  recordSignIn,
  revokeAllSessions,
  signRevokeToken,
  verifyRevokeToken,
} from "@/server/auth/devices";
import type { Notification } from "@/server/email/notify";
import { resetMemberSecondFactor } from "@/server/second-factor-reset";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Connexion renforcée (story S10) : alerte de nouvel appareil, lien « Déconnecter tous mes
// appareils », réinitialisation de la deuxième vérification par un autre admin.
const SECRET = "secret-de-test-secret-de-test-secret-de-test";
const NOW = new Date("2026-11-22T10:00:00Z");

describe("Connexion renforcée (S10)", () => {
  let db: TestDatabase;
  let amapId: string;
  let otherAmapId: string;
  let admin: { id: string; email: string };
  let otherAdmin: { id: string; email: string };
  let referent: { id: string; email: string };
  let stranger: { id: string; email: string };

  const addSession = (userId: string) =>
    db.owner.insert(session).values({
      id: uuidv7(),
      userId,
      token: uuidv7(),
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      createdAt: NOW,
      updatedAt: NOW,
    });
  const sessionsOf = async (userId: string) =>
    (await db.owner.select().from(session).where(eq(session.userId, userId))).length;

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapId = (await f.createAmap("amap-s10")).id;
    otherAmapId = (await f.createAmap("amap-s10-autre")).id;
    admin = await f.createUser();
    otherAdmin = await f.createUser();
    referent = await f.createUser({ twoFactorEnabled: true });
    stranger = await f.createUser({ twoFactorEnabled: true });
    await db.owner.insert(amapRole).values([
      { amapId, userId: admin.id, role: "admin" },
      { amapId, userId: otherAdmin.id, role: "admin" },
      { amapId, userId: referent.id, role: "referent" },
      { amapId: otherAmapId, userId: stranger.id, role: "referent" },
    ]);
  });

  describe("appareils connus", () => {
    const sent: Notification[] = [];
    const signIn = (userId: string, deviceId: string) =>
      recordSignIn(
        db.app,
        {
          userId,
          email: "x@example.org",
          firstName: "Robin",
          deviceId,
          userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
          baseUrl: "http://localhost:3000",
          secret: SECRET,
          now: NOW,
        },
        async (n) => {
          sent.push(n);
        },
      );

    it("n'alerte pas au premier appareil, ni sur un appareil connu", async () => {
      expect(await signIn(referent.id, "appareil-un-appareil-un-1")).toBe("first");
      expect(await signIn(referent.id, "appareil-un-appareil-un-1")).toBe("known");
      expect(sent).toEqual([]);
    });

    it("alerte une fois sur un nouvel appareil, avec le lien de déconnexion", async () => {
      expect(await signIn(referent.id, "appareil-deux-appareil-2")).toBe("new");
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ template: "new_device", userId: referent.id });
      const link = sent[0]?.content.text.match(
        /http:\/\/localhost:3000\/connexion\/deconnecter\?jeton=\S+/,
      );
      expect(link).not.toBeNull();
      expect(await signIn(referent.id, "appareil-deux-appareil-2")).toBe("known");
      expect(sent).toHaveLength(1);
    });

    it("ne garde que l'empreinte de l'appareil, visible de son seul titulaire", async () => {
      const rows = await db.owner.select().from(knownDevice);
      expect(rows.every((r) => !r.deviceHash.includes("appareil"))).toBe(true);
      const seenByOther = await withAmapContext(db.app, { amapId: null, userId: admin.id }, (tx) =>
        tx.select().from(knownDevice),
      );
      expect(seenByOther).toEqual([]);
    });
  });

  describe("lien « Déconnecter tous mes appareils »", () => {
    it("vaut 7 jours et refuse un jeton modifié", () => {
      const token = signRevokeToken(referent.id, NOW, SECRET);
      expect(verifyRevokeToken(token, NOW, SECRET)).toBe(referent.id);
      const in8days = new Date(NOW.getTime() + 8 * 86_400_000);
      expect(verifyRevokeToken(token, in8days, SECRET)).toBeNull();
      expect(verifyRevokeToken(token, NOW, "un-autre-secret")).toBeNull();
      const forged = Buffer.from(`${admin.id}.${NOW.getTime() + 1000}`).toString("base64url");
      expect(verifyRevokeToken(`${forged}.${token.split(".")[1]}`, NOW, SECRET)).toBeNull();
    });

    it("ferme toutes les sessions du compte, et seulement les siennes", async () => {
      await addSession(referent.id);
      await addSession(referent.id);
      await addSession(admin.id);
      expect(await revokeAllSessions(db.auth, referent.id)).toBe(2);
      expect(await sessionsOf(referent.id)).toBe(0);
      expect(await sessionsOf(admin.id)).toBe(1);
    });
  });

  describe("réinitialiser la deuxième vérification", () => {
    const as = (userId: string, verified = true): AmapContext => ({
      amapId,
      userId,
      secondFactorVerified: verified,
    });
    const reset = (ctx: AmapContext, userId: string) =>
      withAmapContext(db.app, ctx, (tx, c) =>
        resetMemberSecondFactor(tx, c, { userId }, (id) => clearSecondFactor(db.auth, id)),
      );

    it("un autre admin de l'AMAP la réinitialise, journalisé (accès autorisé)", async () => {
      await db.owner.insert(twoFactor).values({
        id: uuidv7(),
        userId: referent.id,
        secret: "chiffre",
        backupCodes: "chiffres",
      });
      await db.owner.insert(passkey).values({
        id: uuidv7(),
        userId: referent.id,
        publicKey: "cle",
        credentialID: "identifiant-passkey",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      });
      await addSession(referent.id);

      expect(await reset(as(admin.id), referent.id)).toEqual({
        status: "reset",
        userId: referent.id,
      });
      const [after] = await db.owner.select().from(user).where(eq(user.id, referent.id));
      expect(after?.twoFactorEnabled).toBe(false);
      expect(
        await db.owner.select().from(twoFactor).where(eq(twoFactor.userId, referent.id)),
      ).toEqual([]);
      expect(await db.owner.select().from(passkey).where(eq(passkey.userId, referent.id))).toEqual(
        [],
      );
      expect(await sessionsOf(referent.id)).toBe(0);
      const logs = await db.owner
        .select({ action: auditLog.action, actor: auditLog.actorUserId })
        .from(auditLog)
        .where(eq(auditLog.entityId, referent.id));
      expect(logs).toEqual([{ action: "reset_second_factor", actor: admin.id }]);
    });

    it("refuse pour soi-même, pour une autre AMAP, et à un non-admin (accès refusé)", async () => {
      expect(await reset(as(admin.id), admin.id)).toEqual({ status: "self" });
      expect(await reset(as(admin.id), stranger.id)).toEqual({ status: "forbidden" });
      const [kept] = await db.owner.select().from(user).where(eq(user.id, stranger.id));
      expect(kept?.twoFactorEnabled).toBe(true);
      await expect(reset(as(referent.id), otherAdmin.id)).rejects.toThrow();
      await expect(reset(as(otherAdmin.id, false), admin.id)).rejects.toBeInstanceOf(
        SecondFactorRequiredError,
      );
    });
  });
});
