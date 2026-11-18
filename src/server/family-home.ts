import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import {
  amap,
  amapProducer,
  catalogItem,
  cheque,
  distribution,
  order,
  orderLine,
  orderPeriod,
  producer,
  product,
} from "@/db/schema";
import { addMonths } from "@/domain/distributions";
import { homePeriod } from "@/domain/family-home";
import type { MembershipState } from "@/domain/memberships";
import { effectiveStatus, parisDay, periodDays } from "@/domain/order-periods";
import { treatedCount } from "@/domain/orders";

import { membershipStates } from "./memberships";
import { getFamilyOrder, myHousehold } from "./orders";

// Accueil de la famille (story D6) : où en est la commande du mois, prochaine distribution,
// rappel d'adhésion. Comme la commande (D3), tout est lu pour le foyer du compte connecté.

export type HomePeriodView =
  | {
      phase: "open";
      month: string;
      closesOn: string;
      totalCents: number;
      /** Producteurs commandés : un chèque chacun. */
      chequeCount: number;
      treated: number;
      producerCount: number;
    }
  | {
      phase: "closed";
      month: string;
      chequeCount: number;
      totalCents: number;
      /** Première distribution du mois : on y remet les chèques. */
      handOverOn: string | null;
    }
  | { phase: "scheduled"; month: string; opensOn: string };

export type NextDistribution = {
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  lines: Array<{ product: string; producer: string; quantity: number }>;
};

export type FamilyHome =
  | { state: "no_household" }
  | {
      state: "ready";
      membership: MembershipState;
      period: HomePeriodView | null;
      nextDistribution: NextDistribution | null;
    };

/** Jours du mois « AAAA-MM » : bornes pour les distributions. */
const monthRange = (month: string) => [`${month}-01`, `${addMonths(month, 1)}-01`] as const;

export async function getFamilyHome(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<FamilyHome> {
  const home = await myHousehold(tx, ctx);
  if (!home) return { state: "no_household" };
  const today = parisDay(now);
  const membership = (await membershipStates(tx, ctx, [home.id], now)).get(home.id)!;

  const periods = (await tx.select().from(orderPeriod)).map((p) => ({
    ...p,
    month: p.month.slice(0, 7),
    status: effectiveStatus(p, now),
  }));
  const chosen = homePeriod(periods, today.slice(0, 7));
  let period: HomePeriodView | null = null;

  if (chosen?.phase === "open") {
    const current = await getFamilyOrder(tx, ctx, now);
    if (current.state === "open") {
      const ordered = current.producers.filter((p) => p.totalCents > 0);
      period = {
        phase: "open",
        month: current.month,
        closesOn: current.closesOn,
        totalCents: ordered.reduce((sum, p) => sum + p.totalCents, 0),
        chequeCount: ordered.length,
        treated: treatedCount(current.producers.map((p) => p.status)),
        producerCount: current.producers.length,
      };
    }
  } else if (chosen?.phase === "closed") {
    const cheques = await tx
      .select({ expectedCents: cheque.expectedCents })
      .from(cheque)
      .where(
        and(
          eq(cheque.householdId, home.id),
          eq(cheque.orderPeriodId, chosen.period.id),
          isNull(cheque.archivedAt),
        ),
      );
    const [from, to] = monthRange(chosen.period.month);
    const [first] = await tx
      .select({ date: distribution.date })
      .from(distribution)
      .where(
        and(gte(distribution.date, from), lt(distribution.date, to), eq(distribution.isOpen, true)),
      )
      .orderBy(asc(distribution.date))
      .limit(1);
    period = {
      phase: "closed",
      month: chosen.period.month,
      chequeCount: cheques.length,
      totalCents: cheques.reduce((sum, c) => sum + c.expectedCents, 0),
      handOverOn: first?.date ?? null,
    };
  } else if (chosen?.phase === "scheduled") {
    period = {
      phase: "scheduled",
      month: chosen.period.month,
      opensOn: periodDays(chosen.period).opensOn,
    };
  }

  return {
    state: "ready",
    membership,
    period,
    nextDistribution: await nextDistribution(tx, ctx, home.id, today),
  };
}

/** Prochaine distribution ouverte (aujourd'hui compris), avec ce que le foyer y retire. */
async function nextDistribution(
  tx: Transaction,
  ctx: AmapContext,
  householdId: string,
  today: string,
): Promise<NextDistribution | null> {
  const [next] = await tx
    .select({
      id: distribution.id,
      date: distribution.date,
      startTime: distribution.startTime,
      endTime: distribution.endTime,
    })
    .from(distribution)
    .where(and(gte(distribution.date, today), eq(distribution.isOpen, true)))
    .orderBy(asc(distribution.date))
    .limit(1);
  if (!next) return null;
  const [place] = await tx
    .select({ place: amap.distributionPlace })
    .from(amap)
    .where(eq(amap.id, ctx.amapId!));
  const lines = await tx
    .select({ product: product.name, producer: producer.name, quantity: orderLine.quantity })
    .from(orderLine)
    .innerJoin(order, eq(order.id, orderLine.orderId))
    .innerJoin(catalogItem, eq(catalogItem.id, orderLine.catalogItemId))
    .innerJoin(product, eq(product.id, catalogItem.productId))
    .innerJoin(producer, eq(producer.id, product.producerId))
    .where(and(eq(order.householdId, householdId), eq(orderLine.distributionId, next.id)))
    .orderBy(asc(producer.name), asc(product.name));
  return {
    date: next.date,
    startTime: next.startTime.slice(0, 5),
    endTime: next.endTime.slice(0, 5),
    place: place?.place ?? "",
    lines: lines.filter((l) => l.quantity > 0),
  };
}

export type FamilyCheque = {
  producer: string;
  checkPayee: string;
  grossCents: number;
  creditsCents: number;
  expectedCents: number;
  status: "expected" | "received" | "handed_over";
};

export type FamilyCheques =
  | { state: "no_household" }
  | { state: "open" } // commandes ouvertes : le récapitulatif de la commande en tient lieu
  | { state: "none" }
  | { state: "closed"; month: string; handOverOn: string | null; cheques: FamilyCheque[] };

/**
 * Chèques du foyer pour la période clôturée de l'accueil (montants calculés à la clôture,
 * avoirs déduits). Pendant les commandes, la liste se lit dans le récapitulatif (D3).
 */
export async function getFamilyCheques(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<FamilyCheques> {
  const home = await myHousehold(tx, ctx);
  if (!home) return { state: "no_household" };
  const summary = await getFamilyHome(tx, ctx, now);
  if (summary.state !== "ready" || !summary.period) return { state: "none" };
  if (summary.period.phase === "open") return { state: "open" };
  if (summary.period.phase !== "closed") return { state: "none" };

  const [found] = await tx
    .select({ id: orderPeriod.id })
    .from(orderPeriod)
    .where(eq(orderPeriod.month, `${summary.period.month}-01`));
  const cheques = await tx
    .select({
      producer: producer.name,
      checkPayee: amapProducer.checkPayee,
      grossCents: cheque.grossCents,
      creditsCents: cheque.creditsCents,
      expectedCents: cheque.expectedCents,
      status: cheque.status,
    })
    .from(cheque)
    .innerJoin(producer, eq(producer.id, cheque.producerId))
    .innerJoin(
      amapProducer,
      and(eq(amapProducer.producerId, cheque.producerId), eq(amapProducer.amapId, cheque.amapId)),
    )
    .where(
      and(
        eq(cheque.householdId, home.id),
        eq(cheque.orderPeriodId, found!.id),
        isNull(cheque.archivedAt),
      ),
    )
    .orderBy(asc(producer.name));
  return {
    state: "closed",
    month: summary.period.month,
    handOverOn: summary.period.handOverOn,
    cheques,
  };
}
