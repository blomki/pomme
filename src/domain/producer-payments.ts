/**
 * « Mes paiements » du producteur (story F4, ADR 0029) : en lecture seule, ce que le référent a
 * pointé, mois par mois et foyer par foyer, avoirs déduits compris. Montants en centimes entiers.
 */

import { hasOpenGap, type PointedCheque } from "./cheques";

/**
 * Ce que le producteur voit d'un chèque :
 * - `pending` : pas encore reçu par le référent ;
 * - `gap` : reçu, mais le montant diffère et l'écart n'est pas encore réglé ;
 * - `received` : reçu (écart éventuel réglé) ;
 * - `handed_over` : remis au producteur.
 */
export type PaymentState = "pending" | "gap" | "received" | "handed_over";

export function paymentState(cheque: PointedCheque): PaymentState {
  if (cheque.status === "expected") return "pending";
  if (hasOpenGap(cheque)) return "gap";
  return cheque.status === "handed_over" ? "handed_over" : "received";
}

/** À suivre : chèques pas encore reçus, ou dont l'écart reste à régler. */
export function needsFollowUp(cheque: PointedCheque): boolean {
  const state = paymentState(cheque);
  return state === "pending" || state === "gap";
}

export type MonthSummary = {
  /** Nombre de chèques (un par foyer). */
  total: number;
  /** Reçus par le référent, ou déjà remis. */
  received: number;
  /** Somme des montants attendus (avoirs déduits). */
  expectedCents: number;
  /** Somme des avoirs déduits des chèques du mois. */
  creditsCents: number;
  /** Tous les chèques sont remis au producteur. */
  allHandedOver: boolean;
};

/**
 * Résumé d'un mois : « 20 / 22 chèques reçus », montant attendu et avoirs déduits.
 *
 * @example monthSummary([{ status: "received", expectedCents: 800, creditsCents: 0, receivedCents: 800, gapSettledAt: null }]) // { total: 1, received: 1, … }
 */
export function monthSummary(
  cheques: ReadonlyArray<PointedCheque & { creditsCents: number }>,
): MonthSummary {
  return {
    total: cheques.length,
    received: cheques.filter((c) => c.status !== "expected").length,
    expectedCents: cheques.reduce((sum, c) => sum + c.expectedCents, 0),
    creditsCents: cheques.reduce((sum, c) => sum + c.creditsCents, 0),
    allHandedOver: cheques.length > 0 && cheques.every((c) => c.status === "handed_over"),
  };
}

/**
 * Date de remise des chèques à annoncer :
 * - tous remis : `handed`, le jour de la dernière remise ;
 * - sinon, la distribution prévue (la première du mois, comme sur la liste de chèques des
 *   familles) si elle n'est pas passée : `planned` ;
 * - sinon `unknown` : la date n'est pas encore connue.
 *
 * @param plannedOn première distribution du mois (« 2026-12-03 »), ou null
 * @param lastHandedOverOn jour de la dernière remise, ou null
 * @param today jour courant, heure de Paris
 */
export function handOver(input: {
  allHandedOver: boolean;
  plannedOn: string | null;
  lastHandedOverOn: string | null;
  today: string;
}): { kind: "handed"; on: string } | { kind: "planned"; on: string } | { kind: "unknown" } {
  if (input.allHandedOver && input.lastHandedOverOn) {
    return { kind: "handed", on: input.lastHandedOverOn };
  }
  if (input.plannedOn && input.plannedOn >= input.today) {
    return { kind: "planned", on: input.plannedOn };
  }
  return { kind: "unknown" };
}
