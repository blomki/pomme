import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { distribution, orderPeriod } from "@/db/schema";
import { addDays, effectiveStatus, parisDay, periodDays } from "@/domain/order-periods";
import { defaultWeek, weekToPrepare, type WeekToPrepare } from "@/domain/to-prepare";

import { requireCatalogEditor } from "./catalogs";
import { loadOrderForm } from "./order-forms";

// « À préparer » du producteur (story E5, ADR 0028) : semaine par semaine, pour l'AMAP courante,
// une fois les commandes du mois clôturées (avant, les quantités peuvent encore changer). Le lit
// le producteur lui-même, ou le référent qui le suit (requireCatalogEditor).

/** Une distribution passée reste consultable une semaine (oubli, vérification). */
const PAST_DAYS = 7;

export type ToPrepare = {
  /** Distributions des mois clôturés, de la semaine dernière à la fin, dans l'ordre. */
  weeks: Array<{ id: string; date: string }>;
  chosen: { id: string; date: string } | null;
  prepare: WeekToPrepare;
  /** Pas encore de semaine : jour de clôture des prochaines commandes, s'il y en a. */
  nextClosesOn: string | null;
};

export async function getToPrepare(
  tx: Transaction,
  ctx: AmapContext,
  input: { amapProducerId: string; distributionId?: string },
  now = new Date(),
): Promise<ToPrepare> {
  await requireCatalogEditor(tx, ctx, input.amapProducerId);
  const today = parisDay(now);
  const periods = (await tx.select().from(orderPeriod).orderBy(asc(orderPeriod.month))).map(
    (p) => ({ ...p, month: p.month.slice(0, 7), status: effectiveStatus(p, now) }),
  );
  const closedMonths = periods.filter((p) => p.status === "closed").map((p) => p.month);
  const next = periods.find((p) => p.status !== "closed");
  const nextClosesOn = next ? periodDays(next).closesOn : null;

  const weeks = (
    await tx
      .select({ id: distribution.id, date: distribution.date })
      .from(distribution)
      .where(and(eq(distribution.isOpen, true), gte(distribution.date, addDays(today, -PAST_DAYS))))
      .orderBy(asc(distribution.date))
  ).filter((d) => closedMonths.includes(d.date.slice(0, 7)));

  const chosenId =
    input.distributionId && z.uuid().safeParse(input.distributionId).success
      ? (weeks.find((w) => w.id === input.distributionId)?.id ?? defaultWeek(weeks, today))
      : defaultWeek(weeks, today);
  const chosen = weeks.find((w) => w.id === chosenId) ?? null;
  if (!chosen)
    return { weeks, chosen: null, prepare: { products: [], households: [] }, nextClosesOn };

  const view = await loadOrderForm(tx, input.amapProducerId, chosen.date.slice(0, 7), now);
  return {
    weeks,
    chosen,
    prepare: view ? weekToPrepare(view.form, chosen.id) : { products: [], households: [] },
    nextClosesOn,
  };
}
