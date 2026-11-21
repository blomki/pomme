import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { amap, auditLog } from "@/db/schema";
import {
  getAmapSettings,
  removeAmapLogo,
  saveAmapLogo,
  saveAmapSettings,
} from "@/server/amap-settings";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import type { FileStore } from "@/server/files/storage";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

/** Stockage en mémoire : ce qui a été enregistré, sous quelle clé. */
function memoryStore(): FileStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const base = "https://stockage.example.org/pomme/";
  return {
    files,
    put: async (key, body) => void files.set(key, body),
    delete: async (key) => void files.delete(key),
    publicUrl: (key) => `${base}${key}`,
    keyFromUrl: (url) => (url.startsWith(base) ? url.slice(base.length) : null),
  };
}

const logo = async () =>
  new Blob([
    new Uint8Array(
      await sharp({ create: { width: 1600, height: 1600, channels: 4, background: "#e8722a" } })
        .png()
        .toBuffer(),
    ),
  ]);

const settingsInput = (over: Record<string, unknown> = {}) => ({
  name: "AMAP de Cambremer",
  primary: "#3F6FB5",
  secondary: "#7a5c99",
  tertiary: "#2e8b7a",
  headingFont: "Pattaya",
  contactEmail: "Contact@Example.org",
  volunteersPerDistribution: "4",
  experiencedThreshold: 5,
  membershipExpiryAlertDays: 45,
  orderReminderDays: 3,
  ...over,
});

// Réglages de l'AMAP (story A4), avec la vraie base et la RLS.
describe("Réglages de l'AMAP (A4)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  const store = memoryStore();

  const as = (userId: string, secondFactorVerified = true, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified,
  });
  const run = <T>(ctx: AmapContext, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, ctx, fn);

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    referent = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
  });

  it("lit les réglages, valeurs par défaut comprises", async () => {
    const view = await run(as(admin.id), (tx, c) => getAmapSettings(tx, c));
    expect(view).toMatchObject({
      name: "AMAP amap-a",
      slug: "amap-a",
      logoUrl: null,
      headingFont: "Carlito",
      parameters: {
        volunteersPerDistribution: 3,
        experiencedThreshold: 6,
        membershipExpiryAlertDays: 30,
      },
    });
  });

  it("l'admin enregistre nom, thème, contact et paramètres, journalisés (accès autorisé)", async () => {
    expect(await run(as(admin.id), (tx, c) => saveAmapSettings(tx, c, settingsInput()))).toEqual({
      status: "saved",
    });
    const [row] = await db.owner.select().from(amap).where(eq(amap.id, amapA.id));
    expect(row).toMatchObject({
      name: "AMAP de Cambremer",
      slug: "amap-a", // l'adresse ne change pas
      contactEmail: "contact@example.org",
      theme: {
        primary: "#3f6fb5",
        secondary: "#7a5c99",
        tertiary: "#2e8b7a",
        headingFont: "Pattaya",
      },
      settings: {
        volunteersPerDistribution: 4,
        experiencedThreshold: 5,
        membershipExpiryAlertDays: 45,
      },
    });
    const journal = await db.owner
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.amapId, amapA.id), eq(auditLog.action, "update_settings")));
    expect(journal).toEqual([
      expect.objectContaining({
        actorUserId: admin.id,
        before: expect.objectContaining({ name: "AMAP amap-a" }),
        after: expect.objectContaining({ name: "AMAP de Cambremer" }),
      }),
    ]);
  });

  it("refuse des réglages non valables, sans rien enregistrer", async () => {
    expect(
      await run(as(admin.id), (tx, c) =>
        saveAmapSettings(
          tx,
          c,
          settingsInput({
            name: "",
            primary: "bleu",
            volunteersPerDistribution: 0,
            contactEmail: "x",
          }),
        ),
      ),
    ).toEqual({
      status: "invalid",
      problems: [{ field: "contactEmail", problem: "invalid" }],
    });
    expect(
      await run(as(admin.id), (tx, c) =>
        saveAmapSettings(
          tx,
          c,
          settingsInput({ name: "", primary: "bleu", volunteersPerDistribution: 0 }),
        ),
      ),
    ).toEqual({
      status: "invalid",
      problems: [
        { field: "name", problem: "required" },
        { field: "primary", problem: "color" },
        { field: "volunteersPerDistribution", problem: "range" },
      ],
    });
    const [row] = await db.owner
      .select({ name: amap.name })
      .from(amap)
      .where(eq(amap.id, amapA.id));
    expect(row?.name).toBe("AMAP de Cambremer");
  });

  it("le logo est ré-encodé, stocké, remplacé puis retiré, journalisé", async () => {
    const file = await logo();
    const first = await run(as(admin.id), (tx, c) => saveAmapLogo(tx, c, { file }, store));
    expect(first).toMatchObject({ status: "saved", previousUrl: null });
    if (first.status !== "saved") return;
    const key = store.keyFromUrl(first.logoUrl)!;
    expect(key).toMatch(/^logos\/.+\.webp$/);
    const meta = await sharp(store.files.get(key)!).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });

    const second = await run(as(admin.id), (tx, c) => saveAmapLogo(tx, c, { file }, store));
    expect(second).toMatchObject({ status: "saved", previousUrl: first.logoUrl });

    expect(
      await run(as(admin.id), (tx, c) =>
        saveAmapLogo(tx, c, { file: new Blob(["pas une image"]) }, store),
      ),
    ).toEqual({ status: "not_image" });
    expect(await run(as(admin.id), (tx, c) => saveAmapLogo(tx, c, { file: null }, null))).toEqual({
      status: "unavailable",
    });

    const removed = await run(as(admin.id), (tx, c) => removeAmapLogo(tx, c));
    expect(removed).toMatchObject({ status: "removed" });
    const [row] = await db.owner
      .select({ logoUrl: amap.logoUrl })
      .from(amap)
      .where(eq(amap.id, amapA.id));
    expect(row?.logoUrl).toBeNull();
    const actions = await db.owner
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.amapId, amapA.id));
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(["update_logo", "update_logo", "remove_logo"]),
    );
  });

  it("refuse le référent, l'admin sans deuxième vérification et l'admin d'une autre AMAP (accès refusé)", async () => {
    await expect(
      run(as(referent.id), (tx, c) => saveAmapSettings(tx, c, settingsInput())),
    ).rejects.toThrow(ForbiddenError);
    await expect(run(as(referent.id), (tx, c) => getAmapSettings(tx, c))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      run(as(admin.id, false), (tx, c) => saveAmapSettings(tx, c, settingsInput())),
    ).rejects.toThrow(SecondFactorRequiredError);
    await expect(
      run(as(admin.id, true, amapB.id), (tx, c) => saveAmapSettings(tx, c, settingsInput())),
    ).rejects.toThrow(ForbiddenError);
    // La base refuse de toute façon de modifier une autre AMAP que l'AMAP courante.
    const updated = await run(as(admin.id), (tx) =>
      tx.update(amap).set({ name: "Piratée" }).where(eq(amap.id, amapB.id)).returning(),
    );
    expect(updated).toEqual([]);
  });
});
