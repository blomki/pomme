import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  auditLog,
  catalogItem,
  distribution,
  producer,
  producerUser,
  product,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError, UnauthenticatedError } from "@/server/auth/errors";
import { getCatalogDraft, saveCatalogDraft } from "@/server/catalogs";
import { listMyProducerAmaps } from "@/server/producer-amaps";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Jour fixe : les catalogues de décembre 2026 restent à venir, quel que soit le jour du test.
const NOW = new Date("2026-11-18T10:00:00Z");

// Catalogue du mois (stories C2 et C3), avec la vraie base et la RLS.
describe("Catalogue du mois (C2)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let otherReferent: { id: string };
  let farmer: { id: string }; // compte du producteur
  let farm: { producerId: string; amapProducerId: string; inB: string };
  let otherFarm: { producerId: string; amapProducerId: string };
  const open: string[] = [];
  let closed: string;

  const as = (userId: string | null, amapId: string): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const inA = <T>(
    fn: Parameters<typeof withAmapContext<T>>[2],
    actor: string | null = referent.id,
  ) => withAmapContext(db.app, as(actor, amapA.id), fn);
  const save = (
    lines: Array<Record<string, unknown>>,
    actor: string = referent.id,
    ap = farm.amapProducerId,
  ) =>
    inA(
      (tx, ctx) => saveCatalogDraft(tx, ctx, { amapProducerId: ap, month: "2026-12", lines }, NOW),
      actor,
    );
  const draft = (actor: string = referent.id) =>
    inA(
      (tx, ctx) =>
        getCatalogDraft(tx, ctx, { amapProducerId: farm.amapProducerId, month: "2026-12" }, NOW),
      actor,
    );

  const newFarm = async (name: string, amapId: string) => {
    const producerId = uuidv7();
    const amapProducerId = uuidv7();
    await db.owner.insert(producer).values({ id: producerId, name });
    await db.owner.insert(amapProducer).values({ id: amapProducerId, amapId, producerId });
    return { producerId, amapProducerId };
  };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    referent = await f.createUser();
    otherReferent = await f.createUser();
    farmer = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapA.id, otherReferent.id, "referent");

    const a = await newFarm("Ruches d'essai", amapA.id);
    const inB = uuidv7();
    await db.owner
      .insert(amapProducer)
      .values({ id: inB, amapId: amapB.id, producerId: a.producerId });
    farm = { ...a, inB };
    otherFarm = await newFarm("Laiterie d'essai", amapA.id);
    await db.owner.insert(referentAssignment).values([
      { amapId: amapA.id, amapProducerId: farm.amapProducerId, userId: referent.id },
      { amapId: amapA.id, amapProducerId: otherFarm.amapProducerId, userId: otherReferent.id },
    ]);
    await db.owner.insert(producerUser).values({ producerId: farm.producerId, userId: farmer.id });

    // Décembre 2026 : jeudis 3, 10, 17, 24 ouverts ; 31 fermé.
    for (const date of ["2026-12-03", "2026-12-10", "2026-12-17", "2026-12-24"]) {
      const id = uuidv7();
      open.push(id);
      await db.owner
        .insert(distribution)
        .values({ id, amapId: amapA.id, date, startTime: "18:00", endTime: "19:30" });
    }
    closed = uuidv7();
    await db.owner.insert(distribution).values({
      id: closed,
      amapId: amapA.id,
      date: "2026-12-31",
      startTime: "18:00",
      endTime: "19:30",
      isOpen: false,
      closedReason: "Noël",
    });
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  it("montre un catalogue vide, avec les distributions du mois", async () => {
    const result = await draft();
    expect(result).toMatchObject({ producerName: "Ruches d'essai", status: null, lines: [] });
    expect(result?.distributions.map((d) => [d.date, d.isOpen])).toEqual([
      ["2026-12-03", true],
      ["2026-12-10", true],
      ["2026-12-17", true],
      ["2026-12-24", true],
      ["2026-12-31", false],
    ]);
  });

  it("enregistre le brouillon : produits, prix en centimes, disponibilités", async () => {
    expect(
      await save([
        { name: " Miel,  pot de 500 g ", price: "8,50", available: open },
        { name: "Miel, pot de 250 g", price: "5", available: [open[0], open[2]] },
      ]),
    ).toEqual({ status: "saved" });
    const result = await draft();
    expect(result?.status).toBe("draft");
    expect(result?.lines.map((l) => [l.name, l.priceCents, l.available.length, l.removed])).toEqual(
      [
        ["Miel, pot de 500 g", 850, 4, false],
        ["Miel, pot de 250 g", 500, 2, false],
      ],
    );
    const [entry] = await db.owner.select().from(auditLog).where(eq(auditLog.action, "save_draft"));
    expect(entry?.after).toMatchObject({ month: "2026-12", lines: 2 });
  });

  it("refuse un prix invalide, une distribution fermée et un produit en double", async () => {
    expect(await save([{ name: "Miel", price: "0", available: [] }])).toEqual({
      status: "invalid",
      errors: [{ line: 0, field: "price" }],
    });
    expect(await save([{ name: "Miel", price: "3", available: [closed] }])).toEqual({
      status: "invalid",
      errors: [{ line: 0, field: "available" }],
    });
    expect(
      await save([
        { name: "Miel", price: "3" },
        { name: "miel", price: "4" },
      ]),
    ).toEqual({ status: "duplicate", names: ["Miel"] });
  });

  it("retire un produit de ce catalogue seulement, puis le remet", async () => {
    const before = await draft();
    const lines = before!.lines.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      price: String(l.priceCents / 100),
      available: l.available,
      removed: l.name === "Miel, pot de 250 g",
    }));
    expect(await save(lines)).toEqual({ status: "saved" });
    const after = await draft();
    const removed = after?.lines.find((l) => l.name === "Miel, pot de 250 g");
    expect(removed).toMatchObject({ removed: true, available: [] });
    // La fiche produit, commune, n'est pas archivée.
    const [row] = await db.owner.select().from(product).where(eq(product.id, removed!.productId));
    expect(row?.archivedAt).toBeNull();

    expect(await save(lines.map((l) => ({ ...l, removed: false, available: [open[1]] })))).toEqual({
      status: "saved",
    });
    expect((await draft())?.lines.every((l) => !l.removed)).toBe(true);
  });

  it("réutilise la fiche commune d'un produit déjà connu du producteur", async () => {
    // Le producteur a déjà ce produit (par exemple pour une autre AMAP).
    const productId = uuidv7();
    await db.owner
      .insert(product)
      .values({ id: productId, producerId: farm.producerId, name: "Pain d'épices" });
    const current = (await draft())!.lines.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      price: String(l.priceCents / 100),
      available: l.available,
    }));
    expect(await save([...current, { name: "pain D'ÉPICES", price: "6" }])).toEqual({
      status: "saved",
    });
    const items = await db.owner
      .select()
      .from(catalogItem)
      .where(eq(catalogItem.productId, productId));
    expect(items).toHaveLength(1);
    const all = await db.owner
      .select()
      .from(product)
      .where(eq(product.producerId, farm.producerId));
    expect(all).toHaveLength(3);
  });

  it("laisse le producteur lui-même modifier son catalogue", async () => {
    const current = (await draft(farmer.id))!.lines.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      price: l.name.startsWith("Miel, pot de 500") ? "9" : String(l.priceCents / 100),
      available: l.available,
    }));
    expect(await save(current, farmer.id)).toEqual({ status: "saved" });
    const entries = await db.owner.select().from(auditLog).where(eq(auditLog.action, "save_draft"));
    expect(entries.at(-1)?.after).toMatchObject({
      priceChanges: [{ name: "Miel, pot de 500 g", before: 850, after: 900 }],
    });
  });

  it("refuse un référent qui ne suit pas ce producteur, l'admin, et un visiteur", async () => {
    await expect(draft(otherReferent.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(save([], otherReferent.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(draft(admin.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      inA(
        (tx, ctx) =>
          getCatalogDraft(tx, ctx, { amapProducerId: farm.amapProducerId, month: "2026-12" }, NOW),
        null,
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("empêche, au niveau de la base, un autre référent de modifier un prix", async () => {
    const [item] = await db.owner.select().from(catalogItem).limit(1);
    const updated = await inA(
      (tx) =>
        tx
          .update(catalogItem)
          .set({ priceCents: 1 })
          .where(eq(catalogItem.id, item!.id))
          .returning({ id: catalogItem.id }),
      otherReferent.id,
    );
    expect(updated).toEqual([]);
  });

  it("isole les AMAP : le catalogue de l'AMAP A est invisible depuis l'AMAP B", async () => {
    const seen = await withAmapContext(db.app, as(farmer.id, amapB.id), (tx) =>
      tx.select().from(catalogItem),
    );
    expect(seen).toEqual([]);
    // Dans l'AMAP B, le producteur part d'un catalogue vide pour le même mois.
    const inB = await withAmapContext(db.app, as(farmer.id, amapB.id), (tx, ctx) =>
      getCatalogDraft(tx, ctx, { amapProducerId: farm.inB, month: "2026-12" }, NOW),
    );
    expect(inB).toMatchObject({ status: null, lines: [], distributions: [] });
    // Une disponibilité ne peut pas viser une distribution d'une autre AMAP (clé composée).
    const rows = await db.owner
      .select({ id: catalogItem.id })
      .from(catalogItem)
      .where(and(eq(catalogItem.amapId, amapA.id)));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("liste au producteur, hors de toute AMAP, les AMAP qu'il livre, et à lui seul", async () => {
    const mine = await listMyProducerAmaps(farmer.id, db.app);
    expect(mine.map((a) => [a.amapSlug, a.amapProducerId, a.producerName])).toEqual([
      ["amap-a", farm.amapProducerId, "Ruches d'essai"],
      ["amap-b", farm.inB, "Ruches d'essai"],
    ]);
    // Un référent ou un admin n'est pas producteur : rien.
    expect(await listMyProducerAmaps(referent.id, db.app)).toEqual([]);
    expect(await listMyProducerAmaps(admin.id, db.app)).toEqual([]);
  });

  it("ne liste plus une AMAP où le producteur ne livre plus (inactif)", async () => {
    await db.owner.update(amapProducer).set({ active: false }).where(eq(amapProducer.id, farm.inB));
    try {
      const mine = await listMyProducerAmaps(farmer.id, db.app);
      expect(mine.map((a) => a.amapSlug)).toEqual(["amap-a"]);
    } finally {
      await db.owner
        .update(amapProducer)
        .set({ active: true })
        .where(eq(amapProducer.id, farm.inB));
    }
  });

  it("hors de toute AMAP, la base ne montre toujours aucun lien producteur–AMAP", async () => {
    // La fonction ne change pas la Row Level Security : sans AMAP courante, rien n'est visible.
    const seen = await withAmapContext(db.app, { amapId: null, userId: farmer.id }, (tx) =>
      tx.select().from(amapProducer),
    );
    expect(seen).toEqual([]);
  });
});
