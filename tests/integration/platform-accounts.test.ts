import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { auditLog, passkey, platformAuditLog, session, twoFactor, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { clearSecondFactor } from "@/server/auth/devices";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import { findPlatformAccount, resetSecondFactorFromPlatform } from "@/server/platform-accounts";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Réinitialisation de la deuxième vérification par le gestionnaire de la plateforme (story S10b,
// ADR 0047), avec la vraie base et la RLS.
describe("Comptes vus depuis la plateforme (S10b)", () => {
  let db: TestDatabase;
  let platformAdmin: { id: string };
  let otherPlatformAdmin: { id: string; email: string };
  let amapAdmin: { id: string };
  let lockedAdmin: { id: string; email: string };

  const as = (userId: string, secondFactorVerified = true): AmapContext => ({
    amapId: null,
    userId,
    secondFactorVerified,
  });
  const find = (ctx: AmapContext, email: string) =>
    withAmapContext(db.app, ctx, (tx, c) => findPlatformAccount(tx, c, { email }));
  const reset = (ctx: AmapContext, userId: string) =>
    withAmapContext(db.app, ctx, (tx, c) =>
      resetSecondFactorFromPlatform(tx, c, { userId }, (id) => clearSecondFactor(db.auth, id)),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    platformAdmin = await f.createUser({ isPlatformAdmin: true, twoFactorEnabled: true });
    otherPlatformAdmin = await f.createUser({ isPlatformAdmin: true, twoFactorEnabled: true });
    amapAdmin = await f.createUser({ twoFactorEnabled: true });
    // Seul admin de son AMAP, qui a perdu son téléphone : le cas de la fiche.
    lockedAdmin = await f.createUser({
      email: "seul.admin@example.org",
      firstName: "Camille",
      lastName: "Seule",
      twoFactorEnabled: true,
    });
    const amapA = await f.createAmap("amap-s10b");
    const amapB = await f.createAmap("amap-s10b-autre");
    await f.grantRole(amapA.id, lockedAdmin.id, "admin");
    await f.grantRole(amapB.id, lockedAdmin.id, "referent");
    await f.grantRole(amapA.id, amapAdmin.id, "admin");
  });

  it("le gestionnaire retrouve un compte par son email, avec ses AMAP (accès autorisé)", async () => {
    expect(await find(as(platformAdmin.id), "  Seul.Admin@Example.org ")).toEqual({
      status: "found",
      account: {
        userId: lockedAdmin.id,
        email: "seul.admin@example.org",
        firstName: "Camille",
        lastName: "Seule",
        isPlatformAdmin: false,
        hasSecondFactor: true,
        amapNames: ["AMAP amap-s10b", "AMAP amap-s10b-autre"],
      },
    });
    expect(await find(as(platformAdmin.id), "personne.inconnue@example.org")).toEqual({
      status: "not_found",
    });
    expect(await find(as(platformAdmin.id), "pas une adresse")).toEqual({ status: "invalid" });
  });

  it("le gestionnaire réinitialise la deuxième vérification, au journal de la plateforme (accès autorisé)", async () => {
    await db.owner.insert(twoFactor).values({
      id: uuidv7(),
      userId: lockedAdmin.id,
      secret: "chiffre",
      backupCodes: "chiffres",
    });
    await db.owner.insert(passkey).values({
      id: uuidv7(),
      userId: lockedAdmin.id,
      publicKey: "cle",
      credentialID: "identifiant-passkey-s10b",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
    });
    await db.owner.insert(session).values({
      id: uuidv7(),
      userId: lockedAdmin.id,
      token: uuidv7(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    expect(await reset(as(platformAdmin.id), lockedAdmin.id)).toEqual({
      status: "reset",
      userId: lockedAdmin.id,
    });

    const [after] = await db.owner.select().from(user).where(eq(user.id, lockedAdmin.id));
    expect(after?.twoFactorEnabled).toBe(false);
    expect(
      await db.owner.select().from(twoFactor).where(eq(twoFactor.userId, lockedAdmin.id)),
    ).toEqual([]);
    expect(await db.owner.select().from(passkey).where(eq(passkey.userId, lockedAdmin.id))).toEqual(
      [],
    );
    expect(await db.owner.select().from(session).where(eq(session.userId, lockedAdmin.id))).toEqual(
      [],
    );

    const logs = await db.owner
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.entityId, lockedAdmin.id));
    expect(logs).toMatchObject([
      {
        actorUserId: platformAdmin.id,
        entityType: "user",
        action: "reset_second_factor",
        before: { twoFactorEnabled: true, passkeys: 1 },
        after: { twoFactorEnabled: false, passkeys: 0 },
      },
    ]);
    // Rien dans le journal des AMAP : le gestionnaire n'agit pas au nom d'une AMAP.
    expect(
      await db.owner.select().from(auditLog).where(eq(auditLog.entityId, lockedAdmin.id)),
    ).toEqual([]);
  });

  it("refuse le compte d'un gestionnaire, le sien compris, et un compte inconnu", async () => {
    expect(await reset(as(platformAdmin.id), otherPlatformAdmin.id)).toEqual({
      status: "platform_admin",
    });
    expect(await reset(as(platformAdmin.id), platformAdmin.id)).toEqual({
      status: "platform_admin",
    });
    expect(await reset(as(platformAdmin.id), uuidv7())).toEqual({ status: "not_found" });
    expect(await reset(as(platformAdmin.id), "pas-un-identifiant")).toEqual({ status: "invalid" });
    const [kept] = await db.owner.select().from(user).where(eq(user.id, otherPlatformAdmin.id));
    expect(kept?.twoFactorEnabled).toBe(true);
  });

  it("refuse un admin d'AMAP et une session sans deuxième vérification (accès refusé)", async () => {
    await expect(find(as(amapAdmin.id), lockedAdmin.email)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reset(as(amapAdmin.id), lockedAdmin.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(find(as(platformAdmin.id, false), lockedAdmin.email)).rejects.toBeInstanceOf(
      SecondFactorRequiredError,
    );
    await expect(reset(as(platformAdmin.id, false), lockedAdmin.id)).rejects.toBeInstanceOf(
      SecondFactorRequiredError,
    );
  });

  it("journal de la plateforme : lisible par les gestionnaires seulement, jamais écrit par l'application", async () => {
    const read = (userId: string) =>
      withAmapContext(db.app, as(userId), (tx) => tx.select().from(platformAuditLog));
    expect((await read(otherPlatformAdmin.id)).length).toBeGreaterThan(0);
    expect(await read(amapAdmin.id)).toEqual([]);
    await expect(
      withAmapContext(db.app, as(platformAdmin.id), (tx) =>
        tx.insert(platformAuditLog).values({
          id: uuidv7(),
          actorUserId: platformAdmin.id,
          entityType: "user",
          entityId: amapAdmin.id,
          action: "reset_second_factor",
        }),
      ),
    ).rejects.toThrow();
  });
});
