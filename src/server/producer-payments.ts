import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { cheque, distribution, household, orderPeriod } from "@/db/schema";
import { addMonths, parseMonth } from "@/domain/distributions";
import { parisDay } from "@/domain/order-periods";
import {
  handOver,
  monthSummary,
  paymentState,
  type MonthSummary,
  type PaymentState,
} from "@/domain/producer-payments";

import { requireCatalogEditor } from "./catalogs";
import { listProducerCredits, type CreditView } from "./credits";

// « Mes paiements » du producteur (story F4, ADR 0029) : en lecture seule, les chèques que le
// référent a pointés, pour l'AMAP courante, mois par mois et foyer par foyer, avoirs déduits
// compris. Le lit le producteur lui-même, ou le référent qui le suit (requireCatalogEditor) ;
// la Row Level Security (ADR 0021) ne montre de toute façon que les chèques de ce producteur.

export type PaymentRow = {
  id: string;
  householdName: string;
  state: PaymentState;
  grossCents: number;
  creditsCents: number;
  expectedCents: number;
  receivedCents: number | null;
};

export type ProducerPayments = {
  /** Mois qui ont des chèques, du plus récent au plus ancien. */
  months: Array<{
    month: string;
    total: number;
    received: number;
    /** Jour de la dernière remise, si tous les chèques du mois sont remis. */
    handedOverOn: string | null;
  }>;
  chosen: {
    month: string;
    summary: MonthSummary;
    handOver: ReturnType<typeof handOver>;
    rows: PaymentRow[];
  } | null;
  /** Avoirs encore à déduire, puis ceux déduits des chèques du mois choisi. */
  credits: CreditView[];
};

export async function getProducerPayments(
  tx: Transaction,
  ctx: AmapContext,
  input: { amapProducerId: string; month?: string },
  now = new Date(),
): Promise<ProducerPayments> {
  const editor = await requireCatalogEditor(tx, ctx, input.amapProducerId);
  const today = parisDay(now);

  const all = await tx
    .select({
      id: cheque.id,
      householdName: household.name,
      month: orderPeriod.month,
      status: cheque.status,
      grossCents: cheque.grossCents,
      creditsCents: cheque.creditsCents,
      expectedCents: cheque.expectedCents,
      receivedCents: cheque.receivedCents,
      gapSettledAt: cheque.gapSettledAt,
      handedOverAt: cheque.handedOverAt,
    })
    .from(cheque)
    .innerJoin(orderPeriod, eq(orderPeriod.id, cheque.orderPeriodId))
    .innerJoin(household, eq(household.id, cheque.householdId))
    .where(and(eq(cheque.producerId, editor.producerId), isNull(cheque.archivedAt)))
    .orderBy(desc(orderPeriod.month), asc(sql`lower(${household.name})`));

  // Regroupement par mois (« 2026-12 »), dans l'ordre de la requête.
  const byMonth = new Map<string, typeof all>();
  for (const row of all) {
    const month = row.month.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
  }
  const lastHandedOverOn = (rows: typeof all) => {
    const times = rows.flatMap((r) => (r.handedOverAt ? [r.handedOverAt.getTime()] : []));
    return times.length > 0 ? parisDay(new Date(Math.max(...times))) : null;
  };
  const months = [...byMonth].map(([month, rows]) => {
    const summary = monthSummary(rows);
    return {
      month,
      total: summary.total,
      received: summary.received,
      handedOverOn: summary.allHandedOver ? lastHandedOverOn(rows) : null,
    };
  });

  const asked = input.month ? parseMonth(input.month) : null;
  const month = asked && byMonth.has(asked) ? asked : months[0]?.month;
  const credits = await listProducerCredits(tx, editor.producerId);
  const visibleCredits = credits.filter(
    (c) => c.status === "created" || (month !== undefined && c.deductedMonth === month),
  );
  if (!month) return { months, chosen: null, credits: visibleCredits };

  const rows = byMonth.get(month)!;
  const summary = monthSummary(rows);
  // Remise prévue : la première distribution du mois (même règle que la liste de chèques des
  // familles, story E2), tant que la remise réelle (F3) n'est pas enregistrée.
  const [first] = await tx
    .select({ date: distribution.date })
    .from(distribution)
    .where(
      and(
        gte(distribution.date, `${month}-01`),
        lt(distribution.date, `${addMonths(month, 1)}-01`),
        eq(distribution.isOpen, true),
      ),
    )
    .orderBy(asc(distribution.date))
    .limit(1);

  return {
    months,
    chosen: {
      month,
      summary,
      handOver: handOver({
        allHandedOver: summary.allHandedOver,
        plannedOn: first?.date ?? null,
        lastHandedOverOn: lastHandedOverOn(rows),
        today,
      }),
      rows: rows.map((r) => ({
        id: r.id,
        householdName: r.householdName,
        state: paymentState(r),
        grossCents: r.grossCents,
        creditsCents: r.creditsCents,
        expectedCents: r.expectedCents,
        receivedCents: r.receivedCents,
      })),
    },
    credits: visibleCredits,
  };
}
