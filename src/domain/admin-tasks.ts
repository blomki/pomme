/**
 * Liste de tâches du tableau de bord admin (story H3, ADR 0030). Deux sortes :
 * - « Bloquant » : calculées à l'affichage (producteur sans référent, catalogue pas publié,
 *   signalement pas traité), jamais enregistrées ; elles disparaissent seules ;
 * - « À suivre » : enregistrées par l'application à un moment précis, cochées à la main.
 */

import type { MembershipStatus } from "./memberships";

/** Ce qui crée une tâche « À suivre ». */
export const ADMIN_TASK_KINDS = [
  // Distribution fermée (vacances, jour férié) : prévenir les familles et les producteurs.
  "distribution_closed",
  // Signalement reporté de la feuille d'émargement : en parler au producteur.
  "report_follow_up",
] as const;
export type AdminTaskKind = (typeof ADMIN_TASK_KINDS)[number];

/** Valeurs affichées dans le texte de chaque sorte de tâche. */
export type AdminTaskDetails = {
  distribution_closed: { date: string; reason: string };
  report_follow_up: {
    distributionDate: string;
    producer: string;
    product: string;
    quantity: number;
  };
};

export type FollowUpTask = {
  id: string;
  kind: AdminTaskKind;
  dueDate: string | null;
  createdAt: Date;
  doneAt: Date | null;
};

/** Nombre de tâches terminées montrées (les plus récentes) : la liste ne grandit pas sans fin. */
export const DONE_TASKS_SHOWN = 20;

/**
 * Tâches à faire (échéance la plus proche d'abord, sans échéance à la fin, puis les plus
 * anciennes) et tâches terminées (les plus récentes d'abord, 20 au plus).
 */
export function splitTasks<T extends FollowUpTask>(tasks: readonly T[]): { todo: T[]; done: T[] } {
  const todo = tasks
    .filter((t) => t.doneAt === null)
    .sort(
      (a, b) =>
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  const done = tasks
    .filter((t) => t.doneAt !== null)
    .sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime())
    .slice(0, DONE_TASKS_SHOWN);
  return { todo, done };
}

/**
 * Avancement des adhésions : foyers adhérents (adhésion en cours, y compris celles qui
 * expirent bientôt) et adhésions qui expirent bientôt.
 *
 * @example membershipProgress(["active", "expiring", "expired"]) // { active: 2, expiring: 1, total: 3 }
 */
export function membershipProgress(statuses: readonly MembershipStatus[]): {
  active: number;
  expiring: number;
  total: number;
} {
  return {
    active: statuses.filter((s) => s === "active" || s === "expiring").length,
    expiring: statuses.filter((s) => s === "expiring").length,
    total: statuses.length,
  };
}
