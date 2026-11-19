/**
 * Avoirs (story F2, ADR 0025) : créés par le référent du producteur (ou un admin) à partir d'un
 * signalement, puis déduits du chèque du foyer chez ce producteur à la clôture suivante où il
 * commande (order-periods.ts, chequesAtClosing). Montants en centimes entiers.
 */

import type { ReportReason } from "./reports";

/** Montant maximal d'un avoir : 10 000 €, comme un prix. */
export const MAX_CREDIT_CENTS = 1_000_000;

/**
 * Montant proposé : le prix payé pour la quantité signalée (prix gardé sur la ligne de commande).
 *
 * @example proposedCreditCents(2, 350) // 700
 */
export function proposedCreditCents(quantity: number, unitPriceCents: number): number {
  return quantity * unitPriceCents;
}

export type CreditProblem =
  | "amount" // montant nul, négatif, décimal ou démesuré
  | "picked_up"; // motif « Autre » : retrait du produit pas confirmé

/**
 * Contrôle d'un avoir : montant strictement positif ; pour un signalement « Autre », le
 * référent confirme que le produit a bien été retiré (jamais d'avoir pour un produit non retiré).
 * Pour « manquant » ou « abîmé », le signalement lui-même dit que le panier a été retiré.
 */
export function checkCredit(input: {
  amountCents: number;
  reason: ReportReason;
  pickedUp: boolean;
}): CreditProblem[] {
  const problems: CreditProblem[] = [];
  if (
    !Number.isInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > MAX_CREDIT_CENTS
  ) {
    problems.push("amount");
  }
  if (input.reason === "other" && !input.pickedUp) problems.push("picked_up");
  return problems;
}
