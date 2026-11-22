import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { amapProducer, producer, producerUser, referentAssignment } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { MAX_UPLOAD_BYTES } from "@/domain/images";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import type { FileStore } from "@/server/files/storage";
import {
  deleteStoredImage,
  removeProducerPhoto,
  saveProducerPhoto,
} from "@/server/producer-photos";

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

const photo = async () =>
  new Blob([
    new Uint8Array(
      await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#6a8f3a" } })
        .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "49/1 8/1 0/1" } })
        .jpeg()
        .toBuffer(),
    ),
  ]);

// Photo du producteur (fiche S11), avec la vraie base et la RLS.
describe("Photo du producteur (S11)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let referent: { id: string };
  let otherReferent: { id: string };
  let admin: { id: string };
  let farmer: { id: string };
  let family: { id: string };
  let producerId: string;
  let farm: string;
  const store = memoryStore();

  const as = (userId: string, secondFactorVerified = true): AmapContext => ({
    amapId: amapA.id,
    userId,
    secondFactorVerified,
  });
  const save = (ctx: AmapContext, input: { alt?: string; file: Blob | null }, s = store) =>
    withAmapContext(db.app, ctx, (tx, c) =>
      saveProducerPhoto(tx, c, { amapProducerId: farm, alt: input.alt ?? "", file: input.file }, s),
    );
  const stored = async () =>
    (
      await db.owner
        .select({ url: producer.photoUrl, alt: producer.photoAlt })
        .from(producer)
        .where(eq(producer.id, producerId))
    )[0]!;

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    referent = await f.createUser();
    otherReferent = await f.createUser();
    admin = await f.createUser();
    farmer = await f.createUser();
    family = await f.createUser();
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");
    await f.grantRole(amapA.id, admin.id, "admin");
    producerId = uuidv7();
    const otherProducerId = uuidv7();
    await db.owner.insert(producer).values([
      { id: producerId, name: "Ferme d'essai" },
      { id: otherProducerId, name: "Fournil d'essai" },
    ]);
    farm = uuidv7();
    const bakery = uuidv7();
    await db.owner.insert(amapProducer).values([
      { id: farm, amapId: amapA.id, producerId },
      { id: bakery, amapId: amapA.id, producerId: otherProducerId },
    ]);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm, userId: referent.id },
      { amapId: amapA.id, amapProducerId: bakery, userId: otherReferent.id },
    ]);
    await db.owner.insert(producerUser).values({ producerId, userId: farmer.id });
  });

  it("le référent du producteur envoie une photo, ré-encodée et réduite (accès autorisé)", async () => {
    const result = await save(as(referent.id), {
      alt: "  Marie   dans son verger ",
      file: await photo(),
    });
    expect(result).toMatchObject({
      status: "saved",
      photoAlt: "Marie dans son verger",
      previousUrl: null,
    });
    if (result.status !== "saved") throw new Error(result.status);
    expect(await stored()).toEqual({ url: result.photoUrl, alt: "Marie dans son verger" });

    const key = store.keyFromUrl(result.photoUrl)!;
    expect(key).toMatch(/^producteurs\/[0-9a-f-]+\.webp$/);
    const meta = await sharp(store.files.get(key)!).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 1200, height: 800 });
    expect(meta.exif).toBeUndefined();
  });

  it("l'admin remplace la photo (deuxième vérification) ; l'ancienne est à supprimer", async () => {
    const before = await stored();
    const result = await save(as(admin.id, true), { file: await photo() });
    if (result.status !== "saved") throw new Error(result.status);
    expect(result.previousUrl).toBe(before.url);
    await deleteStoredImage(store, result.previousUrl);
    expect(store.files.has(store.keyFromUrl(before.url!)!)).toBe(false);
    expect(store.files.size).toBe(1);

    // Seulement le texte alternatif : la photo ne change pas.
    expect(
      await save(as(admin.id, true), { alt: "La ferme au printemps", file: null }),
    ).toMatchObject({
      status: "saved",
      photoUrl: result.photoUrl,
      previousUrl: null,
    });
  });

  it("refuse les autres comptes (accès refusé)", async () => {
    const file = await photo();
    await expect(save(as(otherReferent.id), { file })).rejects.toThrow(ForbiddenError);
    await expect(save(as(family.id), { file })).rejects.toThrow(ForbiddenError);
    await expect(save(as(farmer.id), { file })).rejects.toThrow(ForbiddenError);
    await expect(save(as(admin.id, false), { file })).rejects.toThrow(SecondFactorRequiredError);
    await expect(
      withAmapContext(db.app, as(otherReferent.id), (tx, c) =>
        removeProducerPhoto(tx, c, { amapProducerId: farm }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuse un fichier qui n'est pas une photo, trop lourd, ou un texte trop long", async () => {
    const count = store.files.size;
    const fake = new Blob([new TextEncoder().encode("<svg onload=alert(1)></svg>")]);
    expect(await save(as(referent.id), { file: fake })).toEqual({ status: "not_image" });
    // Commence comme un JPEG, mais illisible.
    const broken = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])]);
    expect(await save(as(referent.id), { file: broken })).toEqual({ status: "not_image" });
    const huge = new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]);
    expect(await save(as(referent.id), { file: huge })).toEqual({ status: "too_large" });
    expect(await save(as(referent.id), { alt: "a".repeat(151), file: await photo() })).toEqual({
      status: "invalid_alt",
    });
    // Rien n'a été stocké pour ces envois refusés.
    expect(store.files.size).toBe(count);
  });

  it("sans stockage configuré, l'envoi est indisponible", async () => {
    expect(await save(as(referent.id), { file: await photo() }, null as never)).toEqual({
      status: "unavailable",
    });
  });

  it("retire la photo", async () => {
    const before = await stored();
    const removed = await withAmapContext(db.app, as(referent.id), (tx, c) =>
      removeProducerPhoto(tx, c, { amapProducerId: farm }),
    );
    expect(removed).toEqual({ status: "removed", previousUrl: before.url });
    expect(await stored()).toEqual({ url: null, alt: "" });
    // Sans photo, changer seulement le texte alternatif n'a pas de sens.
    expect(await save(as(referent.id), { alt: "x", file: null })).toEqual({ status: "no_file" });
  });
});
