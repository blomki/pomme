import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { passkey } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { createHousehold, getHousehold } from "@/server/households";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { expectDatabaseError } from "./helpers/errors";
import { fixtures } from "./helpers/fixtures";

// Fiche #125 : « Réinitialiser la deuxième vérification » n'est proposé que pour un admin ou un
// référent qui a un moyen de vérification. La table des passkeys reste fermée à l'application :
// la fonction amap_members_with_second_factor (migration 0048) répond à sa place.
describe("Deuxième vérification des membres d'un foyer (#125)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let householdId: string;
  let f: ReturnType<typeof fixtures>;
  const ids: Record<string, string> = {};

  const as = (userId: string, amapId: string): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor = admin.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);

  beforeAll(async () => {
    db = await startDatabase();
    f = fixtures(db.owner);
    amapA = await f.createAmap("amap-2fa-a");
    amapB = await f.createAmap("amap-2fa-b");
    admin = await f.createUser({ firstName: "Alix", twoFactorEnabled: true });
    await f.grantRole(amapA.id, admin.id, "admin");

    const created = await inA((tx, ctx) =>
      createHousehold(tx, ctx, {
        name: "Foyer 2FA",
        members: [
          { email: "avec.appli@example.org", firstName: "Appli", isPrimary: true },
          { email: "avec.passkey@example.org", firstName: "Passkey" },
          { email: "sans.moyen@example.org", firstName: "Sans" },
          { email: "amapien.passkey@example.org", firstName: "Amapien" },
        ],
      }),
    );
    if (created.status !== "created") throw new Error(created.status);
    householdId = created.householdId;
    for (const invitation of created.invitations) ids[invitation.email] = invitation.userId;

    const appli = ids["avec.appli@example.org"]!;
    const withPasskey = ids["avec.passkey@example.org"]!;
    await f.grantRole(amapA.id, appli, "referent");
    await f.grantRole(amapA.id, withPasskey, "admin");
    await f.grantRole(amapA.id, ids["sans.moyen@example.org"]!, "referent");
    await db.owner.execute(sql`update "user" set two_factor_enabled = true where id = ${appli}`);
    for (const userId of [withPasskey, ids["amapien.passkey@example.org"]!]) {
      await db.owner.insert(passkey).values({
        id: uuidv7(),
        userId,
        publicKey: "cle",
        credentialID: `passkey-${userId}`,
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      });
    }
  }, 120_000);

  it("propose la réinitialisation seulement aux admins et référents qui ont un moyen de vérification (accès autorisé)", async () => {
    const view = await inA((tx, ctx) => getHousehold(tx, ctx, householdId));
    const offered = Object.fromEntries(
      view!.members.map((m) => [m.firstName, m.canResetSecondFactor]),
    );
    expect(offered).toEqual({
      Appli: true, // référent avec application
      Passkey: true, // admin avec passkey
      Sans: false, // référent sans aucun moyen : rien à réinitialiser
      Amapien: false, // passkey, mais aucun rôle soumis à la deuxième vérification
    });
  });

  it("ne propose rien sur sa propre ligne", async () => {
    const self = ids["avec.passkey@example.org"]!;
    const view = await inA((tx, ctx) => getHousehold(tx, ctx, householdId), self);
    expect(view!.members.find((m) => m.userId === self)?.canResetSecondFactor).toBe(false);
  });

  it("la fonction est refusée à qui n'est pas admin de l'AMAP courante (accès refusé)", async () => {
    const referent = ids["avec.appli@example.org"]!;
    await expectDatabaseError(
      inA(
        (tx) => tx.execute(sql`select amap_members_with_second_factor(array[${referent}]::uuid[])`),
        referent,
      ),
      /réservé aux administrateurs/,
    );
  });

  it("la fonction ne dit rien des comptes d'une autre AMAP (isolation)", async () => {
    const otherAdmin = await f.createUser({ twoFactorEnabled: true });
    await f.grantRole(amapB.id, otherAdmin.id, "admin");
    const rows = await withAmapContext(db.app, as(admin.id, amapA.id), (tx) =>
      tx.execute<{ id: string }>(
        sql`select id from amap_members_with_second_factor(array[${otherAdmin.id}, ${ids["avec.appli@example.org"]!}]::uuid[]) as id`,
      ),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([ids["avec.appli@example.org"]]);
  });

  it("l'application ne lit toujours aucune passkey", async () => {
    expect(await inA((tx) => tx.select().from(passkey))).toEqual([]);
  });
});
