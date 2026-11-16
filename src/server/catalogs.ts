import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  catalogItemAvailability,
  distribution,
  producer,
  producerUser,
  product,
  referentAssignment,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import {
  duplicateNames,
  normalizeProductName,
  parsePriceCents,
  sameProductName,
} from "@/domain/catalog";
import { addMonths, parseMonth } from "@/domain/distributions";

import { ForbiddenError, UnauthenticatedError } from "./auth/errors";
import { writeAuditLog } from "./audit";

// Catalogue du mois d'un producteur dans l'AMAP courante (story C2). Le modifient : son référent
// dans l'AMAP, ou le producteur lui-même (son compte). Ni l'admin ni les familles. La Row Level
// Security impose la même règle dans la base (politiques catalog_*).

type Editor = { amapProducerId: string; producerId: string; producerName: string };

/**
 * Vérifie que l'utilisateur connecté peut modifier le catalogue de ce producteur de l'AMAP
 * courante, et renvoie le producteur. Équivalent de requireRole pour le catalogue : un
 * producteur n'a pas de rôle dans l'AMAP, seulement un compte lié à son producteur.
 *
 * @throws UnauthenticatedError si personne n'est connecté
 * @throws ForbiddenError si l'utilisateur n'est ni son référent ni le producteur
 */
export async function requireCatalogEditor(
  tx: Transaction,
  ctx: AmapContext,
  amapProducerId: string,
): Promise<Editor> {
  if (!ctx.userId) throw new UnauthenticatedError();
  if (!ctx.amapId || !z.uuid().safeParse(amapProducerId).success) throw new ForbiddenError();
  const [target] = await tx
    .select({ producerId: amapProducer.producerId, producerName: producer.name })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(amapProducer.id, amapProducerId));
  if (!target) throw new ForbiddenError();

  const [asReferent] = await tx
    .select({ id: referentAssignment.id })
    .from(referentAssignment)
    .where(
      and(
        eq(referentAssignment.amapProducerId, amapProducerId),
        eq(referentAssignment.userId, ctx.userId),
      ),
    );
  const [asProducer] = asReferent
    ? [asReferent]
    : await tx
        .select({ id: producerUser.id })
        .from(producerUser)
        .where(
          and(eq(producerUser.producerId, target.producerId), eq(producerUser.userId, ctx.userId)),
        );
  if (!asProducer) throw new ForbiddenError();
  return { amapProducerId, ...target };
}

export type CatalogDistribution = { id: string; date: string; isOpen: boolean };

export type CatalogLine = {
  itemId: string;
  productId: string;
  name: string;
  priceCents: number;
  /** Distributions où le produit est disponible. */
  available: string[];
  removed: boolean;
};

export type CatalogDraft = {
  producerName: string;
  month: string;
  /** null tant que le catalogue de ce mois n'a jamais été enregistré. */
  status: "draft" | "published" | null;
  distributions: CatalogDistribution[];
  lines: CatalogLine[];
};

/** Distributions d'un mois de l'AMAP courante, par date. */
async function distributionsOf(tx: Transaction, month: string): Promise<CatalogDistribution[]> {
  return tx
    .select({ id: distribution.id, date: distribution.date, isOpen: distribution.isOpen })
    .from(distribution)
    .where(
      and(
        gte(distribution.date, `${month}-01`),
        lt(distribution.date, `${addMonths(month, 1)}-01`),
      ),
    )
    .orderBy(asc(distribution.date));
}

/** Catalogue d'un producteur pour un mois (« 2026-12 »), tel que l'éditeur le voit. */
export async function getCatalogDraft(
  tx: Transaction,
  ctx: AmapContext,
  input: { amapProducerId: string; month: string },
): Promise<CatalogDraft | null> {
  const editor = await requireCatalogEditor(tx, ctx, input.amapProducerId);
  const month = parseMonth(input.month);
  if (!month) return null;

  const distributions = await distributionsOf(tx, month);
  const [found] = await tx
    .select({ id: catalog.id, status: catalog.status })
    .from(catalog)
    .where(and(eq(catalog.producerId, editor.producerId), eq(catalog.month, `${month}-01`)));
  if (!found) {
    return { producerName: editor.producerName, month, status: null, distributions, lines: [] };
  }

  const items = await tx
    .select({
      itemId: catalogItem.id,
      productId: product.id,
      name: product.name,
      priceCents: catalogItem.priceCents,
      removedAt: catalogItem.removedAt,
    })
    .from(catalogItem)
    .innerJoin(product, eq(product.id, catalogItem.productId))
    .where(eq(catalogItem.catalogId, found.id))
    .orderBy(asc(catalogItem.position), asc(product.name));
  const availability = items.length
    ? await tx
        .select({
          itemId: catalogItemAvailability.catalogItemId,
          distributionId: catalogItemAvailability.distributionId,
        })
        .from(catalogItemAvailability)
        .where(
          inArray(
            catalogItemAvailability.catalogItemId,
            items.map((i) => i.itemId),
          ),
        )
    : [];

  return {
    producerName: editor.producerName,
    month,
    status: found.status,
    distributions,
    lines: items.map(({ removedAt, ...item }) => ({
      ...item,
      available: availability.filter((a) => a.itemId === item.itemId).map((a) => a.distributionId),
      removed: removedAt !== null,
    })),
  };
}

const lineSchema = z.object({
  itemId: z.uuid().optional(),
  name: z.string().transform(normalizeProductName).pipe(z.string().min(1).max(120)),
  price: z.string().max(20),
  available: z.array(z.uuid()).max(6).default([]),
  removed: z.boolean().default(false),
});

export const saveDraftSchema = z.object({
  amapProducerId: z.uuid(),
  month: z.string(),
  lines: z.array(lineSchema).max(100),
});

export type LineError = { line: number; field: "name" | "price" | "available" };

export type SaveDraftResult =
  | { status: "saved" }
  | { status: "invalid"; errors: LineError[] }
  | { status: "duplicate"; names: string[] };

/**
 * Enregistre le brouillon du catalogue d'un mois : produits (fiche commune au producteur),
 * prix en centimes, disponibilités par distribution, produits retirés de ce catalogue.
 *
 * - Un nouveau produit dont le nom correspond à un produit existant du producteur (dans une
 *   autre AMAP, par exemple) le réutilise : la fiche reste unique.
 * - Renommer un produit renomme la fiche commune, donc pour toutes les AMAP du producteur.
 * - Seules les distributions ouvertes du mois peuvent être cochées.
 * - Les changements de prix sont inscrits au journal.
 */
export async function saveCatalogDraft(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveDraftResult> {
  const raw = z.object({ amapProducerId: z.string() }).safeParse(input);
  const editor = await requireCatalogEditor(tx, ctx, raw.success ? raw.data.amapProducerId : "");
  const parsed = saveDraftSchema.safeParse(input);
  const month = parsed.success ? parseMonth(parsed.data.month) : null;
  if (!parsed.success || !month) {
    const errors: LineError[] = parsed.success
      ? []
      : parsed.error.issues
          .filter((i) => i.path[0] === "lines")
          .map((i) => ({ line: Number(i.path[1]), field: i.path[2] as LineError["field"] }));
    return { status: "invalid", errors };
  }

  const openIds = new Set(
    (await distributionsOf(tx, month)).filter((d) => d.isOpen).map((d) => d.id),
  );
  const errors: LineError[] = [];
  const lines = parsed.data.lines.map((line, index) => {
    const priceCents = parsePriceCents(line.price);
    if (priceCents === null) errors.push({ line: index, field: "price" });
    if (line.available.some((id) => !openIds.has(id))) {
      errors.push({ line: index, field: "available" });
    }
    return { ...line, priceCents: priceCents ?? 0 };
  });
  if (errors.length > 0) return { status: "invalid", errors };
  const duplicates = duplicateNames(lines);
  if (duplicates.length > 0) return { status: "duplicate", names: duplicates };

  // Le catalogue du mois : créé au premier enregistrement.
  const [existing] = await tx
    .select({ id: catalog.id })
    .from(catalog)
    .where(and(eq(catalog.producerId, editor.producerId), eq(catalog.month, `${month}-01`)));
  const catalogId = existing?.id ?? uuidv7();
  if (!existing) {
    await tx.insert(catalog).values({
      id: catalogId,
      amapId: ctx.amapId!,
      producerId: editor.producerId,
      month: `${month}-01`,
      createdBy: ctx.userId,
    });
  }

  const products = await tx
    .select({ id: product.id, name: product.name })
    .from(product)
    .where(eq(product.producerId, editor.producerId));
  const items = await tx
    .select({
      id: catalogItem.id,
      productId: catalogItem.productId,
      priceCents: catalogItem.priceCents,
      removedAt: catalogItem.removedAt,
    })
    .from(catalogItem)
    .where(eq(catalogItem.catalogId, catalogId));

  const priceChanges: Array<{ name: string; before: number | null; after: number }> = [];
  for (const [position, line] of lines.entries()) {
    let item = line.itemId ? items.find((i) => i.id === line.itemId) : undefined;
    let productId = item?.productId;

    if (productId) {
      // Renommage : la fiche produit est commune à toutes les AMAP du producteur.
      const current = products.find((p) => p.id === productId);
      if (current && current.name !== line.name) {
        await tx.update(product).set({ name: line.name }).where(eq(product.id, productId));
      }
    } else {
      productId = products.find((p) => sameProductName(p.name, line.name))?.id;
      if (!productId) {
        productId = uuidv7();
        await tx.insert(product).values({
          id: productId,
          producerId: editor.producerId,
          name: line.name,
          createdBy: ctx.userId,
        });
        products.push({ id: productId, name: line.name });
      }
      item = items.find((i) => i.productId === productId);
    }

    const removedAt = line.removed ? (item?.removedAt ?? new Date()) : null;
    const itemId = item?.id ?? uuidv7();
    if (item) {
      await tx
        .update(catalogItem)
        .set({ priceCents: line.priceCents, position, removedAt })
        .where(eq(catalogItem.id, item.id));
    } else {
      await tx.insert(catalogItem).values({
        id: itemId,
        amapId: ctx.amapId!,
        catalogId,
        productId,
        priceCents: line.priceCents,
        position,
        removedAt,
      });
      items.push({ id: itemId, productId, priceCents: line.priceCents, removedAt });
    }
    if (item?.priceCents !== line.priceCents) {
      priceChanges.push({
        name: line.name,
        before: item?.priceCents ?? null,
        after: line.priceCents,
      });
    }

    // Disponibilités : exactement les distributions cochées (aucune si le produit est retiré).
    const wanted = line.removed ? [] : [...new Set(line.available)];
    await tx
      .delete(catalogItemAvailability)
      .where(eq(catalogItemAvailability.catalogItemId, itemId));
    if (wanted.length > 0) {
      await tx.insert(catalogItemAvailability).values(
        wanted.map((distributionId) => ({
          amapId: ctx.amapId!,
          catalogItemId: itemId,
          distributionId,
        })),
      );
    }
  }

  await writeAuditLog(tx, ctx, {
    entityType: "catalog",
    entityId: catalogId,
    action: "save_draft",
    after: { month, lines: lines.length, priceChanges },
  });
  return { status: "saved" };
}
