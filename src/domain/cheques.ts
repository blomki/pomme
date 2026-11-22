/**
 * Pointage des chèques (story F1, ADR 0023). Un chèque par foyer, par producteur et par mois,
 * créé à la clôture avec son montant attendu ; le référent le pointe à réception : montant reçu
 * (prérempli avec l'attendu, corrigeable) et numéro facultatif. Montants en centimes entiers.
 */

import { parsePriceCents } from "./catalog";

export type ChequeStatus = "expected" | "received" | "handed_over";

export type PointedCheque = {
  status: ChequeStatus;
  expectedCents: number;
  receivedCents: number | null;
  /** Écart vu et traité par le référent (complément reçu, avoir prévu…), ou null. */
  gapSettledAt: Date | null;
};

/**
 * Écart d'un chèque reçu : reçu − attendu (négatif s'il manque de l'argent), ou null tant
 * qu'il n'est pas reçu.
 *
 * @example chequeGap({ status: "received", expectedCents: 1200, receivedCents: 1000, gapSettledAt: null }) // -200
 */
export function chequeGap(cheque: PointedCheque): number | null {
  if (cheque.status === "expected" || cheque.receivedCents === null) return null;
  return cheque.receivedCents - cheque.expectedCents;
}

/** Écart à traiter : un chèque reçu dont le montant diffère, tant que le référent ne l'a pas réglé. */
export function hasOpenGap(cheque: PointedCheque): boolean {
  const gap = chequeGap(cheque);
  return gap !== null && gap !== 0 && cheque.gapSettledAt === null;
}

/**
 * Remise au producteur (story F3) : un chèque reçu dont l'écart éventuel est réglé. Un écart
 * encore à traiter retient le chèque : une fois remis, il ne se modifie plus.
 */
export function canHandOver(cheque: PointedCheque): boolean {
  return cheque.status === "received" && !hasOpenGap(cheque);
}

/** Filtres de l'écran de pointage : tous, non reçus, écarts à traiter. */
export const CHEQUE_FILTERS = ["all", "pending", "gaps"] as const;
export type ChequeFilter = (typeof CHEQUE_FILTERS)[number];

export function matchesFilter(cheque: PointedCheque, filter: ChequeFilter): boolean {
  if (filter === "pending") return cheque.status === "expected";
  if (filter === "gaps") return hasOpenGap(cheque);
  return true;
}

/**
 * Avancement : « Chèques traités pour N foyers sur M ». Un chèque par foyer et par producteur :
 * pour un producteur, compter les chèques revient à compter les foyers. Traité = reçu (ou déjà
 * remis au producteur).
 */
export function pointageProgress(cheques: readonly PointedCheque[]): {
  treated: number;
  total: number;
} {
  return {
    treated: cheques.filter((c) => c.status !== "expected").length,
    total: cheques.length,
  };
}

/**
 * Montant reçu saisi en euros (« 12,50 ») : en centimes, ou null s'il n'est pas valable. Même
 * règle qu'un prix : positif, deux décimales au plus, 10 000 € au plus.
 */
export function parseReceivedCents(input: string): number | null {
  return parsePriceCents(input);
}

/** Longueur maximale d'un numéro de chèque (7 chiffres en général ; marge pour les espaces). */
export const MAX_CHEQUE_NUMBER_LENGTH = 30;

/**
 * Numéro de chèque nettoyé : espaces en trop retirés ; null s'il est vide. undefined s'il est
 * trop long (refusé).
 *
 * @example cleanChequeNumber(" 1234 567 ") // "1234 567"
 */
export function cleanChequeNumber(input: string): string | null | undefined {
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean === "") return null;
  return clean.length > MAX_CHEQUE_NUMBER_LENGTH ? undefined : clean;
}

/**
 * « Rien ce mois-ci » sur la liste des chèques (story E2) : les producteurs sans commande ce
 * mois-ci, mais commandés au moins une fois sur les 3 mois précédents (règle du cahier des
 * charges). Un producteur jamais commandé n'y figure pas : la liste resterait sans fin.
 *
 * @param history mois (« 2026-11 ») où le foyer a commandé chez chaque producteur
 * @param thisMonth producteurs commandés ce mois-ci (ceux qui ont un chèque)
 */
export function nothingThisMonth(input: {
  month: string;
  history: ReadonlyArray<{ producer: string; month: string }>;
  thisMonth: readonly string[];
}): string[] {
  const recent = new Set([1, 2, 3].map((back) => shiftMonth(input.month, -back)));
  const producers = input.history
    .filter((h) => recent.has(h.month) && !input.thisMonth.includes(h.producer))
    .map((h) => h.producer);
  return [...new Set(producers)].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Mois décalé : shiftMonth("2027-01", -2) → « 2026-11 ». */
function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
