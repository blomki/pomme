/**
 * Signalements (story F5, ADR 0024) : une famille, ou l'admin qui reporte les écarts de la feuille
 * d'émargement, signale un produit manquant ou abîmé sur une ligne de commande d'une distribution
 * passée. Le référent du producteur (ou un admin) décide : avoir (F2) ou rejet.
 */

export const REPORT_REASONS = ["missing", "damaged", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "credited", "rejected"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Longueur maximale d'un commentaire de signalement ou d'un motif de rejet. */
export const MAX_REPORT_COMMENT_LENGTH = 500;

export type ReportProblem =
  | "quantity" // quantité nulle, ou plus que ce qui a été commandé (moins ce qui est déjà signalé)
  | "comment_required" // motif « Autre » sans précision
  | "comment_too_long";

/**
 * Contrôle d'un signalement : quantité de 1 à la quantité commandée, moins ce qui est déjà
 * signalé (et pas rejeté) sur la même ligne ; précision obligatoire pour « Autre ».
 *
 * @example checkReport({ reason: "missing", comment: "", quantity: 1, ordered: 2, alreadyReported: 0 }) // []
 */
export function checkReport(input: {
  reason: ReportReason;
  comment: string;
  quantity: number;
  ordered: number;
  alreadyReported: number;
}): ReportProblem[] {
  const problems: ReportProblem[] = [];
  const available = input.ordered - input.alreadyReported;
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > available) {
    problems.push("quantity");
  }
  const comment = input.comment.trim();
  if (input.reason === "other" && comment === "") problems.push("comment_required");
  if (comment.length > MAX_REPORT_COMMENT_LENGTH) problems.push("comment_too_long");
  return problems;
}

/**
 * Jusqu'à quand une famille peut signaler un problème sur une distribution : jusqu'à la clôture
 * des commandes qui suit la distribution (décision du 2026-11-19), pour que l'avoir soit déduit
 * au plus tôt. null si aucune clôture n'est encore prévue après elle : pas de limite pour
 * l'instant.
 *
 * @param distributionEnd fin du jour de la distribution (minuit, heure de Paris)
 * @param closings instants de clôture des périodes de l'AMAP
 */
export function reportDeadline(distributionEnd: Date, closings: readonly Date[]): Date | null {
  const after = closings
    .filter((c) => c.getTime() > distributionEnd.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return after[0] ?? null;
}

/**
 * Une distribution se signale si elle a eu lieu (ce jour ou avant, heure de Paris) et que la
 * clôture suivante n'est pas passée.
 */
export function canReport(input: {
  distributionDate: string;
  today: string;
  now: Date;
  deadline: Date | null;
}): boolean {
  if (input.distributionDate > input.today) return false;
  return input.deadline === null || input.now.getTime() < input.deadline.getTime();
}
