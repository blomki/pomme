import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  catalogItem,
  cheque,
  distribution,
  household,
  order,
  orderLine,
  orderPeriod,
  producer,
  product,
} from "@/db/schema";
import { addMonths, parseMonth } from "@/domain/distributions";
import { homePeriod } from "@/domain/family-home";
import { effectiveStatus, parisDay, periodDays } from "@/domain/order-periods";
import { buildOrderForm, type OrderForm } from "@/domain/order-forms";

import { requireCatalogEditor } from "./catalogs";

// Bon de commande d'un producteur pour un mois (story E1, ADR 0019). Le lisent : son référent
// dans l'AMAP et le producteur lui-même (requireCatalogEditor), ou toute personne qui a le lien
// signé envoyé au producteur (order-form-link.ts). La Row Level Security limite à l'AMAP.

export type OrderFormPeriod = {
  status: "scheduled" | "open" | "closed";
  opensOn: string;
  closesOn: string;
  closedAt: Date | null;
};

export type OrderFormView = {
  amapProducerId: string;
  producerName: string;
  month: string;
  period: OrderFormPeriod | null;
  form: OrderForm;
};

/** Bon de commande, sans contrôle d'accès : l'appelant l'a fait (rôle ou lien signé). */
export async function loadOrderForm(
  tx: Transaction,
  amapProducerId: string,
  month: string,
  now = new Date(),
): Promise<OrderFormView | null> {
  const [target] = await tx
    .select({ producerId: amapProducer.producerId, producerName: producer.name })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(amapProducer.id, amapProducerId));
  if (!target) return null;

  const [periodRow] = await tx
    .select()
    .from(orderPeriod)
    .where(eq(orderPeriod.month, `${month}-01`));
  const period = periodRow
    ? {
        status: effectiveStatus(periodRow, now),
        ...periodDays(periodRow),
        closedAt: periodRow.closedAt,
      }
    : null;

  const monthDistributions = await tx
    .select({ id: distribution.id, date: distribution.date, isOpen: distribution.isOpen })
    .from(distribution)
    .where(
      and(
        gte(distribution.date, `${month}-01`),
        lt(distribution.date, `${addMonths(month, 1)}-01`),
      ),
    )
    .orderBy(asc(distribution.date));

  const [found] = await tx
    .select({ id: catalog.id })
    .from(catalog)
    .where(and(eq(catalog.producerId, target.producerId), eq(catalog.month, `${month}-01`)));
  const items = found
    ? await tx
        .select({ itemId: catalogItem.id, name: product.name, priceCents: catalogItem.priceCents })
        .from(catalogItem)
        .innerJoin(product, eq(product.id, catalogItem.productId))
        .where(eq(catalogItem.catalogId, found.id))
        .orderBy(asc(catalogItem.position), asc(product.name))
    : [];
  const lines = found
    ? await tx
        .select({
          householdId: order.householdId,
          itemId: orderLine.catalogItemId,
          distributionId: orderLine.distributionId,
          quantity: orderLine.quantity,
          unitPriceCents: orderLine.unitPriceCents,
        })
        .from(orderLine)
        .innerJoin(order, eq(order.id, orderLine.orderId))
        .where(eq(order.catalogId, found.id))
    : [];

  const householdIds = [...new Set(lines.map((l) => l.householdId))];
  const households = householdIds.length
    ? await tx
        .select({ id: household.id, name: household.name })
        .from(household)
        .where(inArray(household.id, householdIds))
    : [];
  const cheques =
    periodRow && householdIds.length
      ? await tx
          .select({
            householdId: cheque.householdId,
            creditsCents: cheque.creditsCents,
            expectedCents: cheque.expectedCents,
          })
          .from(cheque)
          .where(
            and(
              eq(cheque.orderPeriodId, periodRow.id),
              eq(cheque.producerId, target.producerId),
              isNull(cheque.archivedAt),
            ),
          )
      : [];

  // Une distribution fermée ne figure que si des quantités y restent (fermée après coup).
  const withLines = new Set(lines.filter((l) => l.quantity > 0).map((l) => l.distributionId));
  return {
    amapProducerId,
    producerName: target.producerName,
    month,
    period,
    form: buildOrderForm({
      distributions: monthDistributions
        .filter((d) => d.isOpen || withLines.has(d.id))
        .map(({ id, date }) => ({ id, date })),
      items,
      lines,
      households: households.map((h) => {
        const c = cheques.find((x) => x.householdId === h.id);
        return {
          ...h,
          cheque: c ? { creditsCents: c.creditsCents, expectedCents: c.expectedCents } : null,
        };
      }),
    }),
  };
}

/** Bon de commande pour un référent du producteur, ou pour le producteur lui-même. */
export async function getOrderForm(
  tx: Transaction,
  ctx: AmapContext,
  input: { amapProducerId: string; month: string },
  now = new Date(),
): Promise<OrderFormView | null> {
  await requireCatalogEditor(tx, ctx, input.amapProducerId);
  const month = parseMonth(input.month);
  if (!month) return null;
  return loadOrderForm(tx, input.amapProducerId, month, now);
}

/**
 * Mois proposé par défaut : celui que l'accueil famille met en avant (période ouverte, sinon
 * dernière clôturée du mois en cours ou à venir, sinon prochaine prévue), sinon le mois prochain.
 */
export async function defaultOrderFormMonth(tx: Transaction, now = new Date()): Promise<string> {
  const periods = (await tx.select().from(orderPeriod)).map((p) => ({
    ...p,
    month: p.month.slice(0, 7),
    status: effectiveStatus(p, now),
  }));
  const currentMonth = parisDay(now).slice(0, 7);
  return homePeriod(periods, currentMonth)?.period.month ?? addMonths(currentMonth, 1);
}

/**
 * Adresse où envoyer le bon de commande : l'email de la fiche du producteur (commune à toutes
 * ses AMAP), ou null s'il n'en a pas. Les comptes du producteur ne sont pas lus : la Row Level
 * Security ne les montre pas au référent, et la fiche est l'adresse que l'AMAP a choisie.
 */
export async function producerEmail(
  tx: Transaction,
  amapProducerId: string,
): Promise<string | null> {
  const [target] = await tx
    .select({ email: producer.email })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(amapProducer.id, amapProducerId));
  return target?.email || null;
}
