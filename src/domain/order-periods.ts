/**
 * Période de commande (story D2) : une par mois et par AMAP, commune à tous les producteurs.
 * L'admin fixe un jour d'ouverture et un jour de clôture (des jours seulement, décision du
 * 2026-11-18) : les commandes ouvrent à 0 h et ferment à 23 h 59, heure de Paris.
 *
 * Les commandes de décembre se passent en novembre : par défaut, du 15 au 25 du mois d'avant.
 */
import { TZDate } from "@date-fns/tz";
import { tz } from "@date-fns/tz";
import { format } from "date-fns";

import { TIME_ZONE } from "@/i18n/config";

import { addMonths } from "./distributions";

/** États enregistrés d'une période (colonne status). */
export const ORDER_PERIOD_STATUSES = ["scheduled", "open", "closed"] as const;
export type OrderPeriodStatus = (typeof ORDER_PERIOD_STATUSES)[number];

/** Jour du calendrier au format « AAAA-MM-JJ » (« 2026-11-25 »), ou null. */
export function parseDay(input: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? match[0] : null;
}

/** Jour décalé de `delta` jours, sans effet de fuseau : addDays("2026-11-30", 1) → « 2026-12-01 ». */
export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Jour de Paris d'un instant : le 25 novembre à 23 h 30 à Paris reste le 25, même en UTC. */
export function parisDay(instant: Date): string {
  return format(instant, "yyyy-MM-dd", { in: tz(TIME_ZONE) });
}

/** Instant de minuit, heure de Paris, au début de ce jour. */
function parisMidnight(day: string): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(new TZDate(year, month - 1, date, TIME_ZONE).getTime());
}

/** Dates proposées pour la période d'un mois : du 15 au 25 du mois d'avant. */
export function defaultPeriodDays(month: string): { opensOn: string; closesOn: string } {
  const previous = addMonths(month, -1);
  return { opensOn: `${previous}-15`, closesOn: `${previous}-25` };
}

/**
 * Instants d'ouverture et de clôture d'après les jours choisis : ouverture à 0 h le premier
 * jour, clôture à minuit à la fin du dernier jour (donc le lendemain à 0 h), heure de Paris.
 */
export function periodInstants(opensOn: string, closesOn: string) {
  return { opensAt: parisMidnight(opensOn), closesAt: parisMidnight(addDays(closesOn, 1)) };
}

/** Jours affichés d'une période : l'inverse de periodInstants. */
export function periodDays(period: { opensAt: Date; closesAt: Date }) {
  return {
    opensOn: parisDay(period.opensAt),
    closesOn: parisDay(new Date(period.closesAt.getTime() - 1)),
  };
}

type PeriodTimes = { status: OrderPeriodStatus; opensAt: Date; closesAt: Date };

/**
 * État réel d'une période à un instant donné. La tâche planifiée passe d'un état à l'autre une
 * fois par heure : entre-temps, l'heure fait foi (une commande est refusée dès la clôture).
 */
export function effectiveStatus(period: PeriodTimes, now: Date): OrderPeriodStatus {
  if (period.status === "closed" || now >= period.closesAt) return "closed";
  if (now >= period.opensAt) return "open";
  return "scheduled";
}

/** Ce que la tâche planifiée doit faire de cette période maintenant : ouvrir, clôturer ou rien. */
export function dueTransition(period: PeriodTimes, now: Date): "open" | "close" | null {
  if (period.status === "closed") return null;
  if (now >= period.closesAt) return "close";
  if (period.status === "scheduled" && now >= period.opensAt) return "open";
  return null;
}

export type DatesError = "opensOn" | "closesOn" | "before_opening" | "past";

/**
 * Vérifie les jours saisis par l'admin. Le jour de clôture ne peut pas être passé (`today`,
 * jour de Paris) ni précéder l'ouverture ; l'ouverture peut être aujourd'hui ou passée (les
 * commandes s'ouvrent alors tout de suite).
 */
export function checkPeriodDays(
  input: { opensOn: string; closesOn: string },
  today: string,
): { opensOn: string; closesOn: string } | { errors: DatesError[] } {
  const opensOn = parseDay(input.opensOn);
  const closesOn = parseDay(input.closesOn);
  const errors: DatesError[] = [];
  if (!opensOn) errors.push("opensOn");
  if (!closesOn) errors.push("closesOn");
  if (opensOn && closesOn && closesOn < opensOn) errors.push("before_opening");
  if (closesOn && closesOn < today) errors.push("past");
  return errors.length > 0 || !opensOn || !closesOn ? { errors } : { opensOn, closesOn };
}

// --- Clôture : chèques attendus -----------------------------------------------------------

/** Ligne de commande comptée à la clôture (prix gardé au moment de la commande, ADR 0015). */
export type ClosingLine = {
  householdId: string;
  producerId: string;
  quantity: number;
  unitPriceCents: number;
};

/** Avoir en attente (statut created) d'un foyer chez un producteur. */
export type PendingCredit = {
  id: string;
  householdId: string;
  producerId: string;
  amountCents: number;
};

export type ChequeToIssue = {
  householdId: string;
  producerId: string;
  /** Total commandé. */
  grossCents: number;
  /** Avoirs déduits. */
  creditsCents: number;
  /** Montant du chèque : total commandé − avoirs, jamais négatif. */
  expectedCents: number;
  /**
   * Avoirs rattachés à ce chèque. `deductedCents` : la part déduite ; `remainderCents` : ce qui
   * reste d'un avoir plus grand que la commande, reporté sur une prochaine commande.
   */
  credits: Array<{ id: string; deductedCents: number; remainderCents: number }>;
};

const pairKey = (householdId: string, producerId: string) => `${householdId}|${producerId}`;

/**
 * Chèques à émettre à la clôture : un par foyer et par producteur commandé, avec les avoirs en
 * attente déduits, du plus ancien au plus récent, sans jamais rendre le chèque négatif.
 *
 * - Un avoir plus grand que ce qui reste à payer est déduit en partie ; le reste attend la
 *   commande suivante chez ce producteur (règle du 2026-11-04 pour un avoir sans commande).
 * - `locked` : couples foyer|producteur dont le chèque est déjà pointé, à ne pas recalculer
 *   (réouverture des commandes, décision du 2026-11-04).
 * - Les montants sont des centimes entiers.
 */
export function chequesAtClosing(
  lines: readonly ClosingLine[],
  credits: readonly PendingCredit[],
  locked: ReadonlySet<string> = new Set(),
): ChequeToIssue[] {
  const gross = new Map<string, ChequeToIssue>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const key = pairKey(line.householdId, line.producerId);
    if (locked.has(key)) continue;
    const cheque = gross.get(key) ?? {
      householdId: line.householdId,
      producerId: line.producerId,
      grossCents: 0,
      creditsCents: 0,
      expectedCents: 0,
      credits: [],
    };
    cheque.grossCents += line.quantity * line.unitPriceCents;
    gross.set(key, cheque);
  }

  // Identifiants UUID v7 : l'ordre alphabétique est l'ordre de création.
  const oldestFirst = [...credits].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const cheque of gross.values()) {
    let remaining = cheque.grossCents;
    for (const credit of oldestFirst) {
      if (remaining === 0) break;
      if (credit.householdId !== cheque.householdId || credit.producerId !== cheque.producerId) {
        continue;
      }
      const deducted = Math.min(credit.amountCents, remaining);
      cheque.credits.push({
        id: credit.id,
        deductedCents: deducted,
        remainderCents: credit.amountCents - deducted,
      });
      remaining -= deducted;
    }
    cheque.creditsCents = cheque.grossCents - remaining;
    cheque.expectedCents = remaining;
  }
  return [...gross.values()];
}

/** Clé d'un couple foyer et producteur, pour `locked`. */
export { pairKey as chequeKey };

/**
 * Le rappel automatique avant la clôture (story D5) est-il à envoyer aujourd'hui ? Oui à partir
 * de `daysBefore` jours avant le jour de clôture, et jusqu'à ce jour compris. 0 : jamais (rappel
 * désactivé). L'envoi n'a lieu qu'une fois par personne et par période (notification_log).
 *
 * @example reminderDue({ closesOn: "2026-11-25", today: "2026-11-23", daysBefore: 2 }) // true
 */
export function reminderDue(input: {
  closesOn: string;
  today: string;
  daysBefore: number;
}): boolean {
  if (input.daysBefore <= 0) return false;
  return input.today >= addDays(input.closesOn, -input.daysBefore) && input.today <= input.closesOn;
}
