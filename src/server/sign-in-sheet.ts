import { and, eq, gt, gte, lt } from "drizzle-orm";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  catalog,
  catalogItem,
  distribution,
  household,
  order,
  orderLine,
  producer,
  product,
} from "@/db/schema";
import { addMonths } from "@/domain/distributions";
import { buildSignInSheet, type SignInSheet } from "@/domain/sign-in-sheet";

import { requireRole } from "./auth/require-role";

/**
 * Feuille d'émargement d'un mois (story E3, ADR 0027) : distributions ouvertes du mois et
 * quantités commandées, par producteur et par foyer. Réservée aux admins, qui l'impriment.
 */
export async function getSignInSheet(
  tx: Transaction,
  ctx: AmapContext,
  month: string,
): Promise<SignInSheet> {
  await requireRole(tx, ctx, ["admin"]);
  const from = `${month}-01`;
  const to = `${addMonths(month, 1)}-01`;
  const distributions = await tx
    .select({ id: distribution.id, date: distribution.date })
    .from(distribution)
    .where(
      and(gte(distribution.date, from), lt(distribution.date, to), eq(distribution.isOpen, true)),
    );
  const lines = await tx
    .select({
      householdId: household.id,
      householdName: household.name,
      producerName: producer.name,
      productName: product.name,
      distributionId: orderLine.distributionId,
      quantity: orderLine.quantity,
    })
    .from(orderLine)
    .innerJoin(order, eq(order.id, orderLine.orderId))
    .innerJoin(household, eq(household.id, order.householdId))
    .innerJoin(catalog, eq(catalog.id, order.catalogId))
    .innerJoin(producer, eq(producer.id, catalog.producerId))
    .innerJoin(catalogItem, eq(catalogItem.id, orderLine.catalogItemId))
    .innerJoin(product, eq(product.id, catalogItem.productId))
    .innerJoin(distribution, eq(distribution.id, orderLine.distributionId))
    .where(and(gt(orderLine.quantity, 0), gte(distribution.date, from), lt(distribution.date, to)));
  return buildSignInSheet({ distributions, lines });
}
