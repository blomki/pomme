import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext } from "@/db/context";
import { session, twoFactor, user } from "@/db/schema";
import { createAuth, type Auth } from "@/server/auth/auth";
import { SecondFactorRequiredError } from "@/server/auth/errors";
import { requireRole } from "@/server/auth/require-role";
import { loadAccountFactors, markSessionVerified } from "@/server/auth/second-factor-facts";

import { totpFromBase32 } from "../helpers/totp";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Deuxième vérification des admins (story A1), avec la vraie configuration de Better Auth.
describe("Deuxième vérification", () => {
  let db: TestDatabase;
  let auth: Auth;
  const sent: { email: string; url: string }[] = [];
  let amapId: string;
  let admin: { id: string; email: string };
  let referent: { id: string; email: string };
  let platformAdmin: { id: string; email: string };
  let family: { id: string; email: string };

  /** Connexion par lien magique : renvoie l'en-tête Cookie de la nouvelle session. */
  const signInByEmail = async (email: string) => {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/connexion/bienvenue" },
      headers: new Headers(),
    });
    const link = new URL(sent.at(-1)?.url ?? "");
    const response = await auth.api.magicLinkVerify({
      query: Object.fromEntries(link.searchParams) as { token: string },
      headers: new Headers(),
      asResponse: true,
    });
    return cookieFrom(response);
  };

  const cookieFrom = (response: Response) => {
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("pomme.session_token="));
    return (cookie ?? "").split(";")[0] ?? "";
  };

  const headersWith = (cookie: string) => new Headers({ cookie });

  /** Ligne de session correspondant à un cookie (le jeton est avant le point de la signature). */
  const sessionOf = async (cookie: string) => {
    const token = decodeURIComponent(cookie.split("=")[1] ?? "").split(".")[0] ?? "";
    const [row] = await db.owner.select().from(session).where(eq(session.token, token));
    return row;
  };

  beforeAll(async () => {
    db = await startDatabase();
    auth = createAuth({
      db: db.auth,
      baseURL: "http://localhost:3000",
      secret: "secret-de-test-secret-de-test-secret-de-test",
      sendMagicLink: async (email, url) => {
        sent.push({ email, url });
      },
    });
    const f = fixtures(db.owner);
    const amap = await f.createAmap("amap-2fa");
    amapId = amap.id;
    admin = await f.createUser({ email: "admin@example.org" });
    referent = await f.createUser({ email: "referent@example.org" });
    platformAdmin = await f.createUser({ email: "gestion@example.org", isPlatformAdmin: true });
    family = await f.createUser({ email: "famille@example.org" });
    await f.grantRole(amapId, admin.id, "admin");
    await f.grantRole(amapId, referent.id, "referent");
  });

  afterAll(async () => {
    await db?.stop();
  });

  it("sait quels comptes y sont soumis", async () => {
    expect((await loadAccountFactors(db.auth, admin.id)).required).toBe(true);
    expect((await loadAccountFactors(db.auth, platformAdmin.id)).required).toBe(true);
    // Depuis S10 (ADR 0041), les référents aussi ; pas un compte sans rôle (famille).
    expect((await loadAccountFactors(db.auth, referent.id)).required).toBe(true);
    expect((await loadAccountFactors(db.auth, family.id)).required).toBe(false);
  });

  it("ne vérifie pas une session ouverte par lien magique", async () => {
    const cookie = await signInByEmail(admin.email);
    expect((await sessionOf(cookie))?.secondFactorVerifiedAt).toBeNull();
  });

  it("active l'application au premier code juste, et vérifie la nouvelle session", async () => {
    const cookie = await signInByEmail(admin.email);
    const setup = await auth.api.enableTwoFactor({ body: {}, headers: headersWith(cookie) });
    if (!("totpURI" in setup)) throw new Error("Pas de QR code.");
    expect(setup.backupCodes).toHaveLength(10);
    const key = new URL(setup.totpURI).searchParams.get("secret") ?? "";

    const response = await auth.api.verifyTOTP({
      body: { code: totpFromBase32(key) },
      headers: headersWith(cookie),
      asResponse: true,
    });
    expect(response.status).toBe(200);
    const fresh = await sessionOf(cookieFrom(response));
    expect(fresh?.secondFactorVerifiedAt).toBeInstanceOf(Date);

    const [row] = await db.owner.select().from(twoFactor).where(eq(twoFactor.userId, admin.id));
    expect(row?.verified).toBe(true);
    expect(row?.secret).not.toContain(key); // secret stocké chiffré
    const [account] = await db.owner.select().from(user).where(eq(user.id, admin.id));
    expect(account?.twoFactorEnabled).toBe(true);

    // Code de secours : accepté une fois, puis refusé.
    const backup = setup.backupCodes[0] ?? "";
    const next = await signInByEmail(admin.email);
    await expect(
      auth.api.verifyBackupCode({ body: { code: backup }, headers: headersWith(next) }),
    ).resolves.toBeDefined();
    await expect(
      auth.api.verifyBackupCode({ body: { code: backup }, headers: headersWith(next) }),
    ).rejects.toThrow();
  });

  it("refuse d'ajouter une passkey à un admin qui n'a pas fait la deuxième vérification", async () => {
    // L'admin a déjà l'application (test précédent) : un simple lien magique ne suffit pas.
    const cookie = await signInByEmail(admin.email);
    await expect(
      auth.api.generatePasskeyRegistrationOptions({ headers: headersWith(cookie) }),
    ).rejects.toMatchObject({ statusCode: 403 });

    // Après la deuxième vérification, c'est permis.
    const current = await sessionOf(cookie);
    await markSessionVerified(db.auth, current?.token ?? "");
    await expect(
      auth.api.generatePasskeyRegistrationOptions({ headers: headersWith(cookie) }),
    ).resolves.toBeDefined();
  });

  it("ne réinitialise jamais la deuxième vérification par email : un lien magique ne suffit pas (S10)", async () => {
    // L'admin a l'application d'authentification (test plus haut). Avec un simple lien magique
    // (accès à la boîte email seulement), ni la désactiver, ni en régénérer les codes de secours.
    const cookie = await signInByEmail(admin.email);
    await expect(
      auth.api.disableTwoFactor({ body: {}, headers: headersWith(cookie) }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      auth.api.generateBackupCodes({ body: {}, headers: headersWith(cookie) }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((await loadAccountFactors(db.auth, admin.id)).totp).toBe(true);
  });

  it("laisse un compte sans aucun moyen enregistrer le premier (référent)", async () => {
    const cookie = await signInByEmail(referent.email);
    await expect(
      auth.api.generatePasskeyRegistrationOptions({ headers: headersWith(cookie) }),
    ).resolves.toBeDefined();
  });

  it("cache les secrets de l'application au rôle de l'application", async () => {
    expect(await db.app.select().from(twoFactor)).toEqual([]);
    expect((await db.owner.select().from(twoFactor)).length).toBeGreaterThan(0);
  });

  describe("requireRole", () => {
    const run = (userId: string, verified: boolean, allowed: ("admin" | "referent")[]) =>
      withAmapContext(db.app, { amapId, userId, secondFactorVerified: verified }, (tx, ctx) =>
        requireRole(tx, ctx, allowed),
      );

    it("refuse une action d'admin sans deuxième vérification", async () => {
      await expect(run(admin.id, false, ["admin"])).rejects.toBeInstanceOf(
        SecondFactorRequiredError,
      );
    });

    it("laisse passer une action d'admin après la deuxième vérification", async () => {
      await expect(run(admin.id, true, ["admin"])).resolves.toEqual(["admin"]);
    });

    it("l'exige aussi d'un référent depuis S10", async () => {
      await expect(run(referent.id, false, ["admin", "referent"])).rejects.toBeInstanceOf(
        SecondFactorRequiredError,
      );
      await expect(run(referent.id, true, ["admin", "referent"])).resolves.toEqual(["referent"]);
    });
  });
});
