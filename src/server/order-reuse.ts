import { and, asc, eq, gte, lt } from "drizzle-orm";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  catalog,
  catalogItem,
  distribution,
  order,
  orderLine,
  producer,
  product,
} from "@/db/schema";
import { addMonths } from "@/domain/distributions";
import { planReuse, type PreviousProduct, type ReusePlan } from "@/domain/order-reuse";

import { loadHouseholdOrder, myHousehold, openPeriod, setOrderQuantity } from "./orders";

// « Reprendre ma commande du mois précédent » (story D4, ADR 0039). La famille voit d'abord ce
// qui sera recopié (planOrderReuse), puis confirme (applyOrderReuse) : rien n'est enregistré
// sans confirmation. Chaque case passe par setOrderQuantity, avec ses contrôles habituels.

export type ReusePreview =
  | { status: "ready"; previousMonth: string; plan: ReusePlan }
  | { status: "nothing"; previousMonth: string } // rien commandé le mois précédent
  | { status: "not_open" | "no_household" };

/**
 * Commande du foyer le mois précédent, produit par produit, avec la quantité de chaque
 * distribution ouverte de ce mois-là, dans l'ordre des dates.
 */
async function previousMonthOrder(
  tx: Transaction,
  householdId: string,
  month: string,
): Promise<PreviousProduct[]> {
  const weeks = await tx
    .select({ id: distribution.id })
    .from(distribution)
    .where(
      and(
        gte(distribution.date, `${month}-01`),
        lt(distribution.date, `${addMonths(month, 1)}-01`),
        eq(distribution.isOpen, true),
      ),
    )
    .orderBy(asc(distribution.date));
  const lines = await tx
    .select({
      productId: catalogItem.productId,
      name: product.name,
      producerName: producer.name,
      distributionId: orderLine.distributionId,
      quantity: orderLine.quantity,
    })
    .from(orderLine)
    .innerJoin(order, eq(order.id, orderLine.orderId))
    .innerJoin(catalog, eq(catalog.id, order.catalogId))
    .innerJoin(catalogItem, eq(catalogItem.id, orderLine.catalogItemId))
    .innerJoin(product, eq(product.id, catalogItem.productId))
    .innerJoin(producer, eq(producer.id, catalog.producerId))
    .where(and(eq(order.householdId, householdId), eq(catalog.month, `${month}-01`)));
  const products = new Map<string, PreviousProduct>();
  for (const line of lines) {
    const week = weeks.findIndex((w) => w.id === line.distributionId);
    if (week < 0) continue;
    const entry = products.get(line.productId) ?? {
      productId: line.productId,
      name: line.name,
      producerName: line.producerName,
      byWeek: weeks.map(() => 0),
    };
    entry.byWeek[week] = line.quantity;
    products.set(line.productId, entry);
  }
  return [...products.values()].sort(
    (a, b) =>
      a.producerName.localeCompare(b.producerName, "fr") || a.name.localeCompare(b.name, "fr"),
  );
}

/** Ce qui serait recopié de la commande du mois précédent ; rien n'est enregistré. */
export async function planOrderReuse(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<ReusePreview> {
  const home = await myHousehold(tx, ctx);
  if (!home) return { status: "no_household" };
  const period = await openPeriod(tx, now);
  if (!period) return { status: "not_open" };
  const previousMonth = addMonths(period.month, -1);
  const previous = await previousMonthOrder(tx, home.id, previousMonth);
  if (previous.length === 0) return { status: "nothing", previousMonth };
  const { producers } = await loadHouseholdOrder(tx, home.id, period, now);
  const current = producers.flatMap((p) =>
    p.items.map((item) => ({
      productId: item.productId,
      catalogItemId: item.itemId,
      cells: item.cells.map((c) => ({ distributionId: c.distributionId, open: c.lock === null })),
    })),
  );
  return { status: "ready", previousMonth, plan: planReuse(previous, current) };
}

export type ApplyReuseResult =
  | { status: "applied"; saved: number; refused: number }
  | Exclude<ReusePreview, { status: "ready" }>;

/**
 * Recopie après confirmation : le plan est recalculé (le catalogue a pu changer entre-temps),
 * puis chaque case est enregistrée comme une saisie de la famille. Les quantités déjà saisies
 * pour ces produits et ces semaines sont remplacées.
 */
export async function applyOrderReuse(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<ApplyReuseResult> {
  const preview = await planOrderReuse(tx, ctx, now);
  if (preview.status !== "ready") return preview;
  let saved = 0;
  let refused = 0;
  for (const line of preview.plan.lines) {
    const result = await setOrderQuantity(tx, ctx, line, now);
    if (result.status === "saved") saved += 1;
    else refused += 1;
  }
  return { status: "applied", saved, refused };
}
