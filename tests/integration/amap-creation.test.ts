import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { amap, amapRole, auditLog, page, user } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { createAmap } from "@/server/amap-creation";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

const input = (over: Record<string, unknown> = {}) => ({
  name: "AMAP des Vergers",
  slug: "amap-des-vergers",
  primary: "#4F7A28",
  secondary: "#8c4a2f",
  tertiary: "#c9a227",
  headingFont: "Pattaya",
  place: "Salle des fêtes",
  weekday: 4,
  startTime: "18:00",
  endTime: "19:30",
  timezone: "Europe/Paris",
  contactEmail: "",
  admin: { email: "Dominique.Vergers@Example.org", firstName: "Dominique", lastName: "Verger" },
  ...over,
});

// Création d'une AMAP par le gestionnaire (story J1), avec la vraie base et la RLS.
describe("Créer une AMAP (J1)", () => {
  let db: TestDatabase;
  let platformAdmin: { id: string };
  let amapAdmin: { id: string };
  let existing: { id: string };
  let amapA: { id: string };

  const as = (userId: string, secondFactorVerified = true): AmapContext => ({
    amapId: null,
    userId,
    secondFactorVerified,
  });
  const create = (ctx: AmapContext, data: unknown) =>
    withAmapContext(db.app, ctx, (tx, c) => createAmap(tx, c, data));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    platformAdmin = await f.createUser({ isPlatformAdmin: true, firstName: "Gestion" });
    amapAdmin = await f.createUser();
    existing = await f.createUser({ email: "deja.inscrite@example.org", firstName: "Alix" });
    amapA = await f.createAmap("amap-a");
    await f.grantRole(amapA.id, amapAdmin.id, "admin");
  });

  it("le gestionnaire crée l'AMAP, le compte et le rôle de l'admin, journalisés (accès autorisé)", async () => {
    const result = await create(as(platformAdmin.id), input());
    expect(result).toMatchObject({
      status: "created",
      slug: "amap-des-vergers",
      adminCreated: true,
    });
    if (result.status !== "created") return;

    const [created] = await db.owner.select().from(amap).where(eq(amap.id, result.amapId));
    expect(created).toMatchObject({
      name: "AMAP des Vergers",
      distributionPlace: "Salle des fêtes",
      timezone: "Europe/Paris",
      createdBy: platformAdmin.id,
      theme: {
        primary: "#4f7a28",
        secondary: "#8c4a2f",
        tertiary: "#c9a227",
        headingFont: "Pattaya",
      },
      settings: {
        volunteersPerDistribution: 3,
        experiencedThreshold: 6,
        membershipExpiryAlertDays: 30,
        distributionWeekday: 4,
        distributionStartTime: "18:00",
        distributionEndTime: "19:30",
      },
    });
    const [admin] = await db.owner.select().from(user).where(eq(user.id, result.adminUserId));
    expect(admin).toMatchObject({
      email: "dominique.vergers@example.org",
      firstName: "Dominique",
      isPlatformAdmin: false,
    });
    const roles = await db.owner.select().from(amapRole).where(eq(amapRole.amapId, result.amapId));
    expect(roles).toEqual([
      expect.objectContaining({
        userId: result.adminUserId,
        role: "admin",
        createdBy: platformAdmin.id,
      }),
    ]);
    // Pages obligatoires du site (H2), en brouillon.
    const pages = await db.owner.select().from(page).where(eq(page.amapId, result.amapId));
    expect(pages.map((p) => [p.role, p.slug, p.status]).sort()).toEqual([
      ["home", "accueil", "draft"],
      ["legal", "mentions-legales", "draft"],
    ]);
    const journal = await db.owner
      .select()
      .from(auditLog)
      .where(eq(auditLog.amapId, result.amapId));
    expect(journal).toEqual([
      expect.objectContaining({
        actorUserId: platformAdmin.id,
        entityType: "amap",
        action: "create",
      }),
    ]);
  });

  it("un compte qui existe déjà devient admin, sans second compte", async () => {
    const result = await create(
      as(platformAdmin.id),
      input({
        name: "AMAP du Bocage",
        slug: "amap-du-bocage",
        admin: { email: "deja.inscrite@example.org", firstName: "Autre", lastName: "" },
      }),
    );
    expect(result).toMatchObject({
      status: "created",
      adminUserId: existing.id,
      adminCreated: false,
    });
    const [kept] = await db.owner.select().from(user).where(eq(user.id, existing.id));
    expect(kept?.firstName).toBe("Alix");
  });

  it("refuse une adresse prise ou réservée, et les champs non valables", async () => {
    expect(await create(as(platformAdmin.id), input({ name: "Autre" }))).toEqual({
      status: "slug_taken",
    });
    expect(await create(as(platformAdmin.id), input({ slug: "plateforme" }))).toEqual({
      status: "invalid",
      problems: [{ field: "slug", problem: "reserved" }],
    });
    expect(
      await create(
        as(platformAdmin.id),
        input({ slug: "amap-x", primary: "vert", admin: { email: "pas-un-email", firstName: "" } }),
      ),
    ).toEqual({
      status: "invalid",
      problems: expect.arrayContaining([
        { field: "adminEmail", problem: "invalid" },
        { field: "adminFirstName", problem: "invalid" },
      ]),
    });
    // Rien n'a été créé par ces essais.
    const rows = await db.owner.select({ slug: amap.slug }).from(amap);
    expect(rows.map((r) => r.slug).sort()).toEqual([
      "amap-a",
      "amap-des-vergers",
      "amap-du-bocage",
    ]);
  });

  it("refuse l'admin d'une AMAP et le gestionnaire sans deuxième vérification (accès refusé)", async () => {
    await expect(create(as(amapAdmin.id), input({ slug: "amap-y" }))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(create(as(platformAdmin.id, false), input({ slug: "amap-z" }))).rejects.toThrow(
      SecondFactorRequiredError,
    );
    // L'application ne peut toujours pas créer une AMAP sans la fonction dédiée.
    await expect(
      withAmapContext(db.app, as(platformAdmin.id), (tx) =>
        tx.insert(amap).values({ id: uuidv7(), slug: "amap-directe", name: "Directe" }),
      ),
    ).rejects.toThrow();
    // Ni appeler la fonction dédiée sans être gestionnaire.
    await expect(
      withAmapContext(db.app, as(amapAdmin.id), (tx) =>
        tx.execute(sql`select * from create_amap(${uuidv7()}, 'amap-w', 'W', '{}'::jsonb,
          '{}'::jsonb, 'Lieu', 'Europe/Paris', '', ${uuidv7()}, 'w@example.org', 'W', '',
          ${uuidv7()}, ${uuidv7()}, ${uuidv7()}, ${uuidv7()})`),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });
});
