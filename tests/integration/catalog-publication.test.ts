import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  auditLog,
  catalog,
  catalogItem,
  catalogItemAvailability,
  distribution,
  orderPeriod,
  producer,
  product,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError } from "@/server/auth/errors";
import {
  copyPreviousCatalog,
  getCatalogDraft,
  publishCatalog,
  saveCatalogDraft,
  unpublishedCatalogTasks,
} from "@/server/catalogs";
import { blockingTasks } from "@/server/producers";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Préparer, publier, lecture seule (story C3), avec la vraie base et la RLS.
const NOW = new Date("2026-11-18T10:00:00Z");

describe("Préparer et publier le catalogue du mois (C3)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let farm: { producerId: string; amapProducerId: string };
  let dairy: { producerId: string; amapProducerId: string };
  const december: string[] = [];

  const as = (userId: string, amapId: string): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor = referent.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);
  const target = (month: string) => ({ amapProducerId: farm.amapProducerId, month });
  const draft = (month: string, now = NOW) =>
    inA((tx, ctx) => getCatalogDraft(tx, ctx, target(month), now));

  const newFarm = async (name: string) => {
    const producerId = uuidv7();
    const amapProducerId = uuidv7();
    await db.owner.insert(producer).values({ id: producerId, name });
    await db.owner
      .insert(amapProducer)
      .values({ id: amapProducerId, amapId: amapA.id, producerId });
    return { producerId, amapProducerId };
  };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    admin = await f.createUser();
    referent = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    farm = await newFarm("Ruches d'essai");
    dairy = await newFarm("Laiterie d'essai");
    await db.owner.insert(referentAssignment).values({
      amapId: amapA.id,
      amapProducerId: farm.amapProducerId,
      userId: referent.id,
    });

    for (const date of ["2026-12-03", "2026-12-10"]) {
      const id = uuidv7();
      december.push(id);
      await db.owner
        .insert(distribution)
        .values({ id, amapId: amapA.id, date, startTime: "18:00", endTime: "19:30" });
    }

    // Catalogue de novembre : miel à 9 €, cire à 4 € (retirée de ce catalogue).
    const november = uuidv7();
    await db.owner
      .insert(catalog)
      .values({ id: november, amapId: amapA.id, producerId: farm.producerId, month: "2026-11-01" });
    for (const [name, priceCents, removed] of [
      ["Miel, pot de 500 g", 900, false],
      ["Cire, bloc", 400, true],
    ] as const) {
      const productId = uuidv7();
      await db.owner.insert(product).values({ id: productId, producerId: farm.producerId, name });
      await db.owner.insert(catalogItem).values({
        amapId: amapA.id,
        catalogId: november,
        productId,
        priceCents,
        removedAt: removed ? NOW : null,
      });
    }
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  it("propose de reprendre le catalogue précédent, sans ses produits retirés", async () => {
    expect(await draft("2026-12")).toMatchObject({
      status: null,
      readOnly: false,
      previous: { month: "2026-11", products: 1 },
      lines: [],
    });
    // Rien à reprendre pour janvier : décembre n'a pas encore de catalogue.
    expect((await draft("2027-01"))?.previous).toBeNull();
  });

  it("refuse de préparer le catalogue à l'admin", async () => {
    await expect(
      inA((tx, ctx) => copyPreviousCatalog(tx, ctx, target("2026-12"), NOW), admin.id),
    ).rejects.toThrow(ForbiddenError);
  });

  it("prépare le brouillon : produits et prix repris, semaines à cocher", async () => {
    expect(await inA((tx, ctx) => copyPreviousCatalog(tx, ctx, target("2026-12"), NOW))).toEqual({
      status: "copied",
      products: 1,
    });
    const copied = await draft("2026-12");
    expect(copied).toMatchObject({ status: "draft", previous: null });
    expect(copied?.lines.map((l) => [l.name, l.priceCents, l.available])).toEqual([
      ["Miel, pot de 500 g", 900, []],
    ]);
    const [log] = await db.owner
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "copy_previous"));
    expect(log?.after).toMatchObject({ month: "2026-12", products: 1 });
    // Une seule fois.
    expect(await inA((tx, ctx) => copyPreviousCatalog(tx, ctx, target("2026-12"), NOW))).toEqual({
      status: "exists",
    });
  });

  it("refuse de publier un produit disponible à aucune semaine", async () => {
    expect(await inA((tx, ctx) => publishCatalog(tx, ctx, target("2026-12"), NOW))).toEqual({
      status: "problem",
      problem: { kind: "no_week", names: ["Miel, pot de 500 g"] },
    });
  });

  it("publie une fois les semaines cochées, et l'inscrit au journal", async () => {
    const lines = (await draft("2026-12"))!.lines;
    expect(
      await inA((tx, ctx) =>
        saveCatalogDraft(
          tx,
          ctx,
          {
            ...target("2026-12"),
            lines: lines.map((l) => ({
              itemId: l.itemId,
              name: l.name,
              price: "9,00",
              available: [december[0]],
            })),
          },
          NOW,
        ),
      ),
    ).toEqual({ status: "saved" });
    await expect(
      inA((tx, ctx) => publishCatalog(tx, ctx, target("2026-12"), NOW), admin.id),
    ).rejects.toThrow(ForbiddenError);
    expect(await inA((tx, ctx) => publishCatalog(tx, ctx, target("2026-12"), NOW))).toEqual({
      status: "published",
    });
    expect((await draft("2026-12"))?.status).toBe("published");
    const logs = await db.owner.select().from(auditLog).where(eq(auditLog.action, "publish"));
    expect(logs).toHaveLength(1);
    // Publier de nouveau ne change rien.
    await inA((tx, ctx) => publishCatalog(tx, ctx, target("2026-12"), NOW));
    expect(
      await db.owner.select().from(auditLog).where(eq(auditLog.action, "publish")),
    ).toHaveLength(1);
  });

  it("met en lecture seule un mois passé", async () => {
    const past = await draft("2026-11", new Date("2026-12-05T10:00:00Z"));
    expect(past).toMatchObject({ readOnly: true, previous: null });
    expect(past?.lines.map((l) => [l.name, l.removed])).toEqual([
      // Même position : classés par nom. Le produit retiré reste lisible.
      ["Cire, bloc", true],
      ["Miel, pot de 500 g", false],
    ]);
    expect(
      await inA((tx, ctx) =>
        saveCatalogDraft(tx, ctx, { ...target("2026-11"), lines: [] }, new Date("2026-12-05")),
      ),
    ).toEqual({ status: "read_only" });
  });

  it("met en lecture seule le catalogue d'un mois aux commandes clôturées, jusqu'à la réouverture", async () => {
    const periodId = uuidv7();
    await db.owner.insert(orderPeriod).values({
      id: periodId,
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-10", "2026-11-17"),
      status: "closed",
    });
    expect((await draft("2026-12"))?.readOnly).toBe(true);
    expect(await inA((tx, ctx) => publishCatalog(tx, ctx, target("2026-12"), NOW))).toEqual({
      status: "read_only",
    });

    await db.owner
      .update(orderPeriod)
      .set({ status: "open", ...periodInstants("2026-11-10", "2026-11-25") })
      .where(eq(orderPeriod.id, periodId));
    expect((await draft("2026-12"))?.readOnly).toBe(false);
  });

  it("signale les catalogues pas encore publiés à trois jours de l'ouverture des commandes", async () => {
    await db.owner.insert(orderPeriod).values({
      amapId: amapA.id,
      month: "2027-01-01",
      ...periodInstants("2026-12-15", "2026-12-25"),
    });
    const tasks = (now: string) =>
      withAmapContext(db.app, as(admin.id, amapA.id), (tx) =>
        unpublishedCatalogTasks(tx, new Date(now)),
      );
    // Décembre : les commandes sont ouvertes et seul le catalogue des ruches est publié.
    expect(await tasks("2026-11-20T10:00:00Z")).toEqual([
      {
        kind: "catalog_not_published",
        amapProducerId: dairy.amapProducerId,
        name: "Laiterie d'essai",
        month: "2026-12",
        opensOn: "2026-11-10",
      },
    ]);
    // Janvier : rien le 11 décembre, les deux producteurs à partir du 12 (J-3).
    const january = (list: Awaited<ReturnType<typeof tasks>>) =>
      list.filter((t) => t.month === "2027-01").map((t) => t.name);
    expect(january(await tasks("2026-12-11T10:00:00Z"))).toEqual([]);
    expect(january(await tasks("2026-12-12T10:00:00Z"))).toEqual([
      "Laiterie d'essai",
      "Ruches d'essai",
    ]);

    // Dans les tâches du tableau de bord de l'admin.
    const all = await withAmapContext(db.app, as(admin.id, amapA.id), (tx, ctx) =>
      blockingTasks(tx, ctx, new Date("2026-11-20T10:00:00Z")),
    );
    expect(all.map((t) => t.kind)).toEqual(["producer_without_referent", "catalog_not_published"]);

    // Une fois le catalogue de la laiterie publié, la tâche disparaît.
    await db.owner.insert(catalog).values({
      amapId: amapA.id,
      producerId: dairy.producerId,
      month: "2026-12-01",
      status: "published",
    });
    expect(await tasks("2026-11-20T10:00:00Z")).toEqual([]);
  });

  it("garde les disponibilités d'un produit coché avant publication", async () => {
    const rows = await db.owner.select().from(catalogItemAvailability);
    expect(rows.map((r) => r.distributionId)).toEqual([december[0]]);
  });
});
