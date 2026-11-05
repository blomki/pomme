import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { session, user, verification } from "@/db/schema";
import { createAuth, MAGIC_LINK_TTL_MINUTES, type Auth } from "@/server/auth/auth";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Connexion par lien magique avec la vraie configuration de Better Auth et un vrai PostgreSQL.
describe("Connexion sans mot de passe (Better Auth)", () => {
  let db: TestDatabase;
  let auth: Auth;
  const sent: { email: string; url: string }[] = [];
  let alice: { id: string; email: string };

  const requestLink = async (email: string) => {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/connexion/bienvenue", errorCallbackURL: "/connexion?erreur=lien" },
      headers: new Headers(),
    });
    const last = sent.at(-1);
    if (!last) throw new Error("Aucun lien envoyé.");
    return new URL(last.url);
  };

  /** Ouvre le lien comme le ferait le navigateur : renvoie la réponse (redirection, cookies). */
  const openLink = (link: URL) =>
    auth.api.magicLinkVerify({
      query: Object.fromEntries(link.searchParams) as { token: string },
      headers: new Headers(),
      asResponse: true,
    });

  const sessionCookie = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("pomme.session_token="));

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
    alice = await fixtures(db.owner).createUser({ email: "alice@example.org" });
  });

  afterAll(async () => {
    await db?.stop();
  });

  it("envoie un lien valable 15 minutes, dont le jeton est stocké haché", async () => {
    const before = Date.now();
    const link = await requestLink("alice@example.org");
    const token = link.searchParams.get("token") ?? "";
    expect(sent.at(-1)?.email).toBe("alice@example.org");

    const rows = await db.owner.select().from(verification);
    const row = rows.at(-1);
    expect(row?.identifier).not.toContain(token); // jamais le jeton en clair
    const ttl = (row?.expiresAt.getTime() ?? 0) - before;
    expect(ttl).toBeGreaterThan((MAGIC_LINK_TTL_MINUTES - 1) * 60_000);
    expect(ttl).toBeLessThanOrEqual(MAGIC_LINK_TTL_MINUTES * 60_000 + 5_000);
  });

  it("ouvre une session avec un cookie HttpOnly et SameSite=Lax", async () => {
    const response = await openLink(await requestLink("alice@example.org"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/connexion/bienvenue");
    const cookie = sessionCookie(response) ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const [verified] = await db.owner.select().from(user).where(eq(user.id, alice.id));
    expect(verified?.emailVerified).toBe(true);
  });

  it("refuse un lien déjà utilisé", async () => {
    const link = await requestLink("alice@example.org");
    expect(sessionCookie(await openLink(link))).toBeDefined();
    const second = await openLink(link);
    expect(sessionCookie(second)).toBeUndefined();
    expect(second.headers.get("location")).toContain("/connexion?erreur=lien");
  });

  it("ne crée jamais de compte pour une adresse inconnue", async () => {
    const link = await requestLink("inconnu@example.org");
    const response = await openLink(link);
    expect(sessionCookie(response)).toBeUndefined();
    const rows = await db.owner.select().from(user).where(eq(user.email, "inconnu@example.org"));
    expect(rows).toEqual([]);
  });

  it("ferme toutes les sessions avec « Me déconnecter de tous mes appareils »", async () => {
    const first = sessionCookie(await openLink(await requestLink("alice@example.org"))) ?? "";
    await openLink(await requestLink("alice@example.org"));
    const cookieHeader = first.split(";")[0] ?? "";
    await auth.api.revokeSessions({ headers: new Headers({ cookie: cookieHeader }) });
    const remaining = await db.owner.select().from(session).where(eq(session.userId, alice.id));
    expect(remaining).toEqual([]);
  });

  it("cache les sessions et jetons au rôle de l'application", async () => {
    await openLink(await requestLink("alice@example.org"));
    expect(await db.app.select().from(session)).toEqual([]);
    expect(await db.app.select().from(verification)).toEqual([]);
    const [count] = (
      await db.owner.execute<{ n: number }>(sql`select count(*)::int as n from session`)
    ).rows;
    expect(count?.n).toBeGreaterThan(0);
  });
});
