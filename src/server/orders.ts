import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  catalogItemAvailability,
  cheque,
  distribution,
  household,
  householdMember,
  order,
  orderLine,
  orderPeriod,
  producer,
  product,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { addMonths } from "@/domain/distributions";
import { effectiveStatus, parisDay, periodDays } from "@/domain/order-periods";
import {
  cellLock,
  linesTotal,
  MAX_QUANTITY,
  producerOrderStatus,
  type LockReason,
  type ProducerOrderStatus,
} from "@/domain/orders";

import { UnauthenticatedError } from "./auth/errors";
import { hasActiveMembership } from "./memberships";

// Commande du mois d'un foyer (story D3, ADR 0018). Le foyer est celui du compte connecté dans
// l'AMAP courante : une famille ne lit et ne modifie que sa propre commande. Tous les contrôles
// sont refaits ici à chaque saisie (période ouverte, adhésion, disponibilité, distribution à
// venir, chèque pas encore pointé) : l'écran ne fait que les refléter.

/** Foyer actif du compte connecté dans l'AMAP courante, ou null. */
export async function myHousehold(
  tx: Transaction,
  ctx: AmapContext,
): Promise<{ id: string; name: string } | null> {
  if (!ctx.userId) throw new UnauthenticatedError();
  const [row] = await tx
    .select({ id: household.id, name: household.name })
    .from(householdMember)
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .where(
      and(
        eq(householdMember.userId, ctx.userId),
        isNull(householdMember.archivedAt),
        isNull(household.archivedAt),
      ),
    );
  return row ?? null;
}

type OpenPeriod = { id: string; month: string; opensOn: string; closesOn: string };

/** Période de commande ouverte à l'instant `now` (l'heure fait foi, ADR 0015), ou null. */
async function openPeriod(tx: Transaction, now: Date): Promise<OpenPeriod | null> {
  const periods = await tx.select().from(orderPeriod).where(ne(orderPeriod.status, "closed"));
  const open = periods
    .filter((p) => effectiveStatus(p, now) === "open")
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  if (!open) return null;
  return { id: open.id, month: open.month.slice(0, 7), ...periodDays(open) };
}

export type OrderCell = {
  distributionId: string;
  quantity: number;
  /** Prix gardé sur la ligne enregistrée, sinon prix actuel du catalogue. */
  unitPriceCents: number;
  lock: LockReason | null;
};

export type OrderItem = { itemId: string; name: string; priceCents: number; cells: OrderCell[] };

export type OrderProducer = {
  amapProducerId: string;
  producerId: string;
  catalogId: string;
  name: string;
  category: string;
  /** Ordre du chèque : le nom exact à écrire. */
  checkPayee: string;
  status: ProducerOrderStatus;
  totalCents: number;
  chequeReceived: boolean;
  items: OrderItem[];
};

export type FamilyOrder =
  | { state: "no_household" }
  | { state: "not_open" }
  | {
      state: "open";
      periodId: string;
      month: string;
      closesOn: string;
      membershipActive: boolean;
      distributions: Array<{ id: string; date: string }>;
      producers: OrderProducer[];
    };

/**
 * Commande du foyer pour la période ouverte : un producteur par catalogue publié du mois,
 * chaque produit avec une case par distribution du mois.
 */
export async function getFamilyOrder(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<FamilyOrder> {
  const home = await myHousehold(tx, ctx);
  if (!home) return { state: "no_household" };
  const period = await openPeriod(tx, now);
  if (!period) return { state: "not_open" };
  const today = parisDay(now);

  const distributions = await tx
    .select({ id: distribution.id, date: distribution.date, isOpen: distribution.isOpen })
    .from(distribution)
    .where(
      and(
        gte(distribution.date, `${period.month}-01`),
        lt(distribution.date, `${addMonths(period.month, 1)}-01`),
      ),
    )
    .orderBy(asc(distribution.date));

  const catalogs = await tx
    .select({
      catalogId: catalog.id,
      producerId: producer.id,
      amapProducerId: amapProducer.id,
      name: producer.name,
      category: producer.category,
      checkPayee: amapProducer.checkPayee,
    })
    .from(catalog)
    .innerJoin(producer, eq(producer.id, catalog.producerId))
    .innerJoin(
      amapProducer,
      and(eq(amapProducer.producerId, catalog.producerId), eq(amapProducer.amapId, catalog.amapId)),
    )
    .where(
      and(
        eq(catalog.month, `${period.month}-01`),
        eq(catalog.status, "published"),
        eq(amapProducer.active, true),
        isNull(amapProducer.archivedAt),
      ),
    )
    .orderBy(asc(sql`lower(${producer.name})`));
  const catalogIds = catalogs.map((c) => c.catalogId);

  const items = catalogIds.length
    ? await tx
        .select({
          itemId: catalogItem.id,
          catalogId: catalogItem.catalogId,
          name: product.name,
          priceCents: catalogItem.priceCents,
          removedAt: catalogItem.removedAt,
        })
        .from(catalogItem)
        .innerJoin(product, eq(product.id, catalogItem.productId))
        .where(inArray(catalogItem.catalogId, catalogIds))
        .orderBy(asc(catalogItem.position), asc(product.name))
    : [];
  const itemIds = items.map((i) => i.itemId);
  const availability = itemIds.length
    ? await tx
        .select({
          itemId: catalogItemAvailability.catalogItemId,
          distributionId: catalogItemAvailability.distributionId,
        })
        .from(catalogItemAvailability)
        .where(inArray(catalogItemAvailability.catalogItemId, itemIds))
    : [];

  const orders = catalogIds.length
    ? await tx
        .select({ id: order.id, catalogId: order.catalogId, declinedAt: order.declinedAt })
        .from(order)
        .where(and(eq(order.householdId, home.id), inArray(order.catalogId, catalogIds)))
    : [];
  const lines = orders.length
    ? await tx
        .select({
          orderId: orderLine.orderId,
          itemId: orderLine.catalogItemId,
          distributionId: orderLine.distributionId,
          quantity: orderLine.quantity,
          unitPriceCents: orderLine.unitPriceCents,
        })
        .from(orderLine)
        .where(
          inArray(
            orderLine.orderId,
            orders.map((o) => o.id),
          ),
        )
    : [];
  const received = await receivedChequeProducers(tx, home.id, period.id);

  const producers = catalogs.map((c): OrderProducer => {
    const own = orders.find((o) => o.catalogId === c.catalogId);
    const ownLines = lines.filter((l) => l.orderId === own?.id);
    const chequeReceived = received.has(c.producerId);
    const orderItems = items
      .filter((i) => i.catalogId === c.catalogId)
      .map((i) => ({
        ...i,
        lines: ownLines.filter((l) => l.itemId === i.itemId && l.quantity > 0),
      }))
      // Un produit retiré du catalogue disparaît, sauf s'il a déjà été commandé.
      .filter((i) => i.removedAt === null || i.lines.length > 0)
      .map((i): OrderItem => ({
        itemId: i.itemId,
        name: i.name,
        priceCents: i.priceCents,
        cells: distributions.map((d) => {
          const line = i.lines.find((l) => l.distributionId === d.id);
          const available =
            i.removedAt === null &&
            d.isOpen &&
            availability.some((a) => a.itemId === i.itemId && a.distributionId === d.id);
          return {
            distributionId: d.id,
            quantity: line?.quantity ?? 0,
            unitPriceCents: line?.unitPriceCents ?? i.priceCents,
            lock: cellLock({ distributionDate: d.date, today, available, chequeReceived }),
          };
        }),
      }));
    return {
      ...c,
      status: producerOrderStatus({
        quantities: ownLines.map((l) => l.quantity),
        declined: own?.declinedAt != null,
      }),
      totalCents: linesTotal(ownLines),
      chequeReceived,
      items: orderItems,
    };
  });

  return {
    state: "open",
    periodId: period.id,
    month: period.month,
    closesOn: period.closesOn,
    membershipActive: await hasActiveMembership(tx, home.id, now),
    distributions: distributions.map(({ id, date }) => ({ id, date })),
    producers,
  };
}

/** Producteurs dont le chèque du foyer pour cette période est déjà pointé (ou remis). */
async function receivedChequeProducers(
  tx: Transaction,
  householdId: string,
  periodId: string,
): Promise<Set<string>> {
  const rows = await tx
    .select({ producerId: cheque.producerId })
    .from(cheque)
    .where(
      and(
        eq(cheque.householdId, householdId),
        eq(cheque.orderPeriodId, periodId),
        ne(cheque.status, "expected"),
        isNull(cheque.archivedAt),
      ),
    );
  return new Set(rows.map((r) => r.producerId));
}

/** Refus communs à toutes les saisies. */
export type OrderRefusal =
  | { status: "no_household" } // pas de foyer dans cette AMAP
  | { status: "closed" } // aucune période ouverte (clôturée entre-temps, par exemple)
  | { status: "membership" } // adhésion pas en cours
  | { status: "invalid" }; // saisie mal formée ou produit inconnu

/** Foyer, période ouverte et adhésion : préalables à toute saisie. */
async function orderingContext(
  tx: Transaction,
  ctx: AmapContext,
  now: Date,
  { needsMembership }: { needsMembership: boolean },
): Promise<{ home: { id: string }; period: OpenPeriod } | OrderRefusal> {
  const home = await myHousehold(tx, ctx);
  if (!home) return { status: "no_household" };
  const period = await openPeriod(tx, now);
  if (!period) return { status: "closed" };
  if (needsMembership && !(await hasActiveMembership(tx, home.id, now))) {
    return { status: "membership" };
  }
  return { home, period };
}

/** Commande du foyer pour un catalogue : créée au premier besoin. */
async function ensureOrder(
  tx: Transaction,
  ctx: AmapContext,
  householdId: string,
  catalogId: string,
): Promise<{ id: string }> {
  await tx
    .insert(order)
    .values({
      id: uuidv7(),
      amapId: ctx.amapId!,
      householdId,
      catalogId,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    })
    .onConflictDoNothing({ target: [order.householdId, order.catalogId] });
  const [row] = await tx
    .select({ id: order.id })
    .from(order)
    .where(and(eq(order.householdId, householdId), eq(order.catalogId, catalogId)));
  return row!;
}

const quantitySchema = z.object({
  catalogItemId: z.uuid(),
  distributionId: z.uuid(),
  quantity: z.number().int().min(0).max(MAX_QUANTITY),
});

export type SetQuantityResult =
  | { status: "saved"; quantity: number; unitPriceCents: number }
  | { status: "locked"; reason: LockReason }
  | OrderRefusal;

/**
 * Enregistre la quantité d'un produit pour une distribution (0 : retire la ligne). Le prix est
 * celui du catalogue au moment de la saisie (ADR 0015, ADR 0018).
 */
export async function setOrderQuantity(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<SetQuantityResult> {
  const parsed = quantitySchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { catalogItemId, distributionId, quantity } = parsed.data;
  const ready = await orderingContext(tx, ctx, now, { needsMembership: true });
  if ("status" in ready) return ready;
  const { home, period } = ready;

  // Le produit appartient à un catalogue publié du mois commandé.
  const [item] = await tx
    .select({
      catalogId: catalogItem.catalogId,
      priceCents: catalogItem.priceCents,
      removedAt: catalogItem.removedAt,
      producerId: catalog.producerId,
    })
    .from(catalogItem)
    .innerJoin(catalog, eq(catalog.id, catalogItem.catalogId))
    .where(
      and(
        eq(catalogItem.id, catalogItemId),
        eq(catalog.status, "published"),
        eq(catalog.month, `${period.month}-01`),
      ),
    );
  const [target] = await tx
    .select({ date: distribution.date, isOpen: distribution.isOpen })
    .from(distribution)
    .where(eq(distribution.id, distributionId));
  if (!item || !target || !target.date.startsWith(period.month)) return { status: "invalid" };

  const [available] = await tx
    .select({ id: catalogItemAvailability.id })
    .from(catalogItemAvailability)
    .where(
      and(
        eq(catalogItemAvailability.catalogItemId, catalogItemId),
        eq(catalogItemAvailability.distributionId, distributionId),
      ),
    );
  const received = await receivedChequeProducers(tx, home.id, period.id);
  const lock = cellLock({
    distributionDate: target.date,
    today: parisDay(now),
    available: Boolean(available) && target.isOpen && item.removedAt === null,
    chequeReceived: received.has(item.producerId),
  });
  // Mettre à zéro une case devenue indisponible reste permis : on peut toujours retirer.
  if (lock && !(lock === "unavailable" && quantity === 0))
    return { status: "locked", reason: lock };

  const own = await ensureOrder(tx, ctx, home.id, item.catalogId);
  if (quantity === 0) {
    await tx
      .delete(orderLine)
      .where(
        and(
          eq(orderLine.orderId, own.id),
          eq(orderLine.catalogItemId, catalogItemId),
          eq(orderLine.distributionId, distributionId),
        ),
      );
  } else {
    await tx
      .insert(orderLine)
      .values({
        id: uuidv7(),
        amapId: ctx.amapId!,
        orderId: own.id,
        catalogItemId,
        distributionId,
        quantity,
        unitPriceCents: item.priceCents,
      })
      .onConflictDoUpdate({
        target: [orderLine.orderId, orderLine.catalogItemId, orderLine.distributionId],
        set: { quantity, unitPriceCents: item.priceCents },
      });
  }
  // Une quantité saisie annule « rien ce mois-ci ».
  await tx
    .update(order)
    .set({ updatedBy: ctx.userId, ...(quantity > 0 ? { declinedAt: null } : {}) })
    .where(eq(order.id, own.id));
  return { status: "saved", quantity, unitPriceCents: item.priceCents };
}

const quantitiesSchema = z.object({
  // Une case par distribution du mois pour un produit : cinq au plus, dix par prudence.
  lines: z.array(z.unknown()).min(1).max(10),
});

/**
 * Plusieurs quantités d'un coup (« Même quantité chaque semaine ») : une seule requête, une
 * seule transaction. Chaque case est contrôlée comme une saisie seule ; le résultat est donné
 * case par case, dans l'ordre.
 */
export async function setOrderQuantities(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<SetQuantityResult[] | { status: "invalid" }> {
  const parsed = quantitiesSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const results: SetQuantityResult[] = [];
  for (const line of parsed.data.lines) results.push(await setOrderQuantity(tx, ctx, line, now));
  return results;
}

const declineSchema = z.object({ catalogId: z.uuid(), nothing: z.boolean() });

export type DeclineResult = { status: "saved" } | { status: "has_quantities" } | OrderRefusal;

/**
 * « Rien ce mois-ci » chez un producteur (ou l'annule). Refusé s'il reste des quantités :
 * il faut d'abord les retirer, pour que le choix soit sans ambiguïté.
 */
export async function setNothingThisMonth(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<DeclineResult> {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const ready = await orderingContext(tx, ctx, now, { needsMembership: false });
  if ("status" in ready) return ready;
  const [found] = await tx
    .select({ id: catalog.id })
    .from(catalog)
    .where(
      and(
        eq(catalog.id, parsed.data.catalogId),
        eq(catalog.status, "published"),
        eq(catalog.month, `${ready.period.month}-01`),
      ),
    );
  if (!found) return { status: "invalid" };

  const own = await ensureOrder(tx, ctx, ready.home.id, found.id);
  if (parsed.data.nothing) {
    const [line] = await tx
      .select({ id: orderLine.id })
      .from(orderLine)
      .where(and(eq(orderLine.orderId, own.id), sql`${orderLine.quantity} > 0`));
    if (line) return { status: "has_quantities" };
  }
  await tx
    .update(order)
    .set({ declinedAt: parsed.data.nothing ? now : null, updatedBy: ctx.userId })
    .where(eq(order.id, own.id));
  return { status: "saved" };
}

export type ConfirmPlan =
  | {
      status: "ready";
      periodId: string;
      month: string;
      closesOn: string;
      producers: Array<{ name: string; checkPayee: string; totalCents: number }>;
      totalCents: number;
    }
  | { status: "empty" }
  | OrderRefusal
  | { status: "no_household" };

/**
 * « Valider ma commande » : vérifie qu'il y a au moins une quantité et prépare l'email
 * récapitulatif (envoyé par l'action, une fois par personne et par mois). Aucun statut n'est
 * enregistré : la commande reste modifiable jusqu'à la clôture (décision du 2026-11-18).
 */
export async function planOrderConfirmation(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<ConfirmPlan> {
  const current = await getFamilyOrder(tx, ctx, now);
  if (current.state === "no_household") return { status: "no_household" };
  if (current.state === "not_open") return { status: "closed" };
  const ordered = current.producers.filter((p) => p.totalCents > 0);
  if (ordered.length === 0) return { status: "empty" };
  return {
    status: "ready",
    periodId: current.periodId,
    month: current.month,
    closesOn: current.closesOn,
    producers: ordered.map((p) => ({
      name: p.name,
      checkPayee: p.checkPayee,
      totalCents: p.totalCents,
    })),
    totalCents: ordered.reduce((sum, p) => sum + p.totalCents, 0),
  };
}
