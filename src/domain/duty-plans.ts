/**
 * Indisponibilités du trimestre (story G1, ADR 0042). Le planning des permanences est
 * trimestriel : avant chaque trimestre, l'admin ouvre une période de réponse ; chaque amapien
 * coche les distributions où il ne peut pas tenir de permanence.
 *
 * Règles validées le 2026-11-22 :
 * - une réponse par personne (pas par foyer) ;
 * - rien coché, ou pas de réponse à la date limite = disponible partout ;
 * - saisie seulement entre l'ouverture et la date limite ; ensuite, lecture seule.
 *
 * Comme les périodes de commande, l'admin choisit des jours : ouverture à 0 h le premier jour,
 * fin à minuit à la fin de la date limite, heure de Paris (periodInstants).
 */
import { addMonths } from "./distributions";
import { addDays, parseDay } from "./order-periods";

/** États du planning (modèle de données, section 8) : G1 n'utilise que « collecting ». */
export const DUTY_PLAN_STATUSES = ["collecting", "draft", "sent"] as const;
export type DutyPlanStatus = (typeof DUTY_PLAN_STATUSES)[number];

/** Relance automatique : 3 jours avant la date limite. */
export const DUTY_REMINDER_DAYS = 3;

/** Premier jour du trimestre qui contient ce jour : quarterStartOf("2026-11-22") → « 2026-10-01 ». */
export function quarterStartOf(day: string): string {
  const [year, month] = day.split("-").map(Number) as [number, number];
  const first = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(first).padStart(2, "0")}-01`;
}

/** Premier jour du trimestre suivant : nextQuarterStart("2026-11-22") → « 2027-01-01 ». */
export function nextQuarterStart(day: string): string {
  return `${addMonths(quarterStartOf(day).slice(0, 7), 3)}-01`;
}

/** Vrai pour le premier jour d'un trimestre (1er janvier, avril, juillet ou octobre). */
export function isQuarterStart(day: string): boolean {
  return parseDay(day) !== null && quarterStartOf(day) === day;
}

/** Bornes des distributions du trimestre : du premier jour (inclus) au trimestre suivant (exclu). */
export function quarterRange(quarterStart: string): { from: string; to: string } {
  return { from: quarterStart, to: `${addMonths(quarterStart.slice(0, 7), 3)}-01` };
}

/**
 * Jours proposés : ouverture 40 jours avant le trimestre, date limite 19 jours avant (pour le
 * trimestre de janvier : du 22 novembre au 13 décembre). L'admin peut les changer.
 */
export function defaultDutyPlanDays(quarterStart: string): { opensOn: string; deadlineOn: string } {
  return { opensOn: addDays(quarterStart, -40), deadlineOn: addDays(quarterStart, -19) };
}

export type DutyPlanDaysError = "invalid_day" | "order" | "too_late";

/**
 * Vérifie les jours choisis : ouverture au plus tard le jour de la date limite, et date limite
 * avant le début du trimestre (il faut le temps de faire le planning).
 */
export function checkDutyPlanDays(input: {
  quarterStart: string;
  opensOn: string;
  deadlineOn: string;
}): DutyPlanDaysError | null {
  if (!parseDay(input.opensOn) || !parseDay(input.deadlineOn)) return "invalid_day";
  if (input.opensOn > input.deadlineOn) return "order";
  if (input.deadlineOn >= input.quarterStart) return "too_late";
  return null;
}

export type DutyPhase = "upcoming" | "open" | "closed";

/** Où en est la période de réponse à cet instant. */
export function dutyPhase(plan: { opensAt: Date; deadlineAt: Date }, now: Date): DutyPhase {
  if (now < plan.opensAt) return "upcoming";
  return now < plan.deadlineAt ? "open" : "closed";
}

/** Vrai le jour de la relance automatique : 3 jours avant la date limite. */
export function dutyReminderDue(params: { deadlineOn: string; today: string }): boolean {
  return params.today === addDays(params.deadlineOn, -DUTY_REMINDER_DAYS);
}

/**
 * Ne garde, des distributions cochées, que celles du trimestre (sans doublon), dans l'ordre
 * du trimestre. Renvoie null si une distribution inconnue est envoyée : formulaire trafiqué.
 */
export function keepQuarterDistributions(
  picked: readonly string[],
  quarter: readonly string[],
): string[] | null {
  if (picked.some((id) => !quarter.includes(id))) return null;
  return quarter.filter((id) => picked.includes(id));
}
