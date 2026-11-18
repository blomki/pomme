/**
 * Adhésions des foyers (story B1). Une adhésion couvre des jours, début et fin inclus. Le
 * statut se calcule toujours à partir des dates, il n'est jamais enregistré : il change donc
 * seul, jour après jour.
 *
 * Jours au format « AAAA-MM-JJ » : comparer deux jours revient à comparer deux textes.
 */

import { parsePriceCents } from "./catalog";
import { addDays, parseDay } from "./order-periods";

/** Délai d'alerte par défaut avant la fin d'une adhésion (réglage de l'AMAP, A4). */
export const MEMBERSHIP_EXPIRY_ALERT_DAYS = 30;

export const MEMBERSHIP_STATUSES = ["active", "expiring", "upcoming", "expired", "none"] as const;
/**
 * - active : adhésion en cours ;
 * - expiring (expire bientôt) : en cours, mais se termine dans moins de N jours sans suite ;
 * - upcoming (à venir) : aucune en cours, une commencera plus tard ;
 * - expired (expirée) : toutes sont terminées ;
 * - none (aucune) : jamais d'adhésion.
 */
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export type MembershipDays = { startDate: string; endDate: string };

export type MembershipState = {
  status: MembershipStatus;
  /**
   * Jour qui accompagne le statut : fin de la couverture (active, expire bientôt), début
   * (à venir), dernière fin (expirée) ; null sans adhésion.
   */
  date: string | null;
};

/** Le foyer est-il adhérent ce jour-là ? */
export function coversDay(memberships: readonly MembershipDays[], day: string): boolean {
  return memberships.some((m) => m.startDate <= day && day <= m.endDate);
}

/** Nombre de jours de `from` à `to` (positif si `to` est après). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Statut d'adhésion d'un foyer à une date. Une adhésion suivie d'une autre qui commence dès le
 * lendemain n'« expire » pas : la couverture continue, on regarde la fin de la dernière.
 *
 * @example membershipState([{ startDate: "2026-01-01", endDate: "2026-12-31" }], "2026-12-10")
 * // { status: "expiring", date: "2026-12-31" }
 */
export function membershipState(
  memberships: readonly MembershipDays[],
  today: string,
  alertDays = MEMBERSHIP_EXPIRY_ALERT_DAYS,
): MembershipState {
  if (memberships.length === 0) return { status: "none", date: null };

  if (coversDay(memberships, today)) {
    // Fin de la couverture continue à partir d'aujourd'hui.
    let end = today;
    for (;;) {
      const next = memberships.find((m) => m.startDate <= addDays(end, 1) && m.endDate > end);
      if (!next) break;
      end = next.endDate;
    }
    const status = daysBetween(today, end) < alertDays ? "expiring" : "active";
    return { status, date: end };
  }

  const upcoming = memberships
    .filter((m) => m.startDate > today)
    .map((m) => m.startDate)
    .sort()[0];
  if (upcoming) return { status: "upcoming", date: upcoming };

  const lastEnd = memberships
    .map((m) => m.endDate)
    .sort()
    .at(-1)!;
  return { status: "expired", date: lastEnd };
}

/**
 * Dates proposées pour une nouvelle adhésion : un an, à partir du lendemain de la dernière
 * adhésion si elle n'est pas encore terminée (renouvellement sans trou), sinon d'aujourd'hui.
 *
 * @example defaultMembershipDays([], "2026-11-18") // { startDate: "2026-11-18", endDate: "2027-11-17" }
 */
export function defaultMembershipDays(
  memberships: readonly MembershipDays[],
  today: string,
): MembershipDays {
  const lastEnd = memberships
    .map((m) => m.endDate)
    .sort()
    .at(-1);
  const startDate = lastEnd && lastEnd >= today ? addDays(lastEnd, 1) : today;
  const [year, rest] = [Number(startDate.slice(0, 4)), startDate.slice(4)];
  // Un an plus tard, moins un jour. Le 29 février devient le 28 l'année suivante.
  const sameDayNextYear = parseDay(`${year + 1}${rest}`) ?? `${year + 1}-02-28`;
  return { startDate, endDate: addDays(sameDayNextYear, -1) };
}

/**
 * Cotisation saisie en euros, facultative : vide → null (pas de cotisation), « 0 » → 0,
 * sinon le montant en centimes ; undefined si la saisie n'est pas un montant valable.
 *
 * @example parseFeeCents("15") // 1500
 * @example parseFeeCents("") // null
 */
export function parseFeeCents(input: string): number | null | undefined {
  const text = input.trim();
  if (text === "") return null;
  // Zéro (« 0 », « 0,00 € ») : parsePriceCents refuse un prix nul, mais une cotisation peut l'être.
  const digits = text.replace(/[\s€]/g, "").replace(",", ".");
  if (/^[0.]+$/.test(digits) && (digits.match(/\./g) ?? []).length <= 1) {
    return digits.startsWith(".") || digits.endsWith(".") ? undefined : 0;
  }
  return parsePriceCents(text) ?? undefined;
}

export type MembershipInputError = "startDate" | "endDate" | "end_before_start" | "fee";

/** Vérifie une saisie d'adhésion ; renvoie les erreurs, ou les valeurs à enregistrer. */
export function checkMembershipInput(input: {
  startDate: string;
  endDate: string;
  fee: string;
}):
  | { ok: true; startDate: string; endDate: string; feeCents: number | null }
  | { ok: false; errors: MembershipInputError[] } {
  const startDate = parseDay(input.startDate);
  const endDate = parseDay(input.endDate);
  const feeCents = parseFeeCents(input.fee);
  const errors: MembershipInputError[] = [];
  if (!startDate) errors.push("startDate");
  if (!endDate) errors.push("endDate");
  if (startDate && endDate && endDate <= startDate) errors.push("end_before_start");
  if (feeCents === undefined) errors.push("fee");
  if (errors.length > 0 || !startDate || !endDate || feeCents === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, startDate, endDate, feeCents };
}
