/**
 * Calendrier des distributions (story D1).
 *
 * Une distribution par semaine, le jour habituel de l'AMAP (réglage de l'admin). Un mois en
 * compte donc 4 ou 5. Une distribution appartient à la période de commande de son mois : pas
 * de lien direct entre les deux (écart n°8 du modèle, tranché le 2026-11-15), ce qui permet de
 * préparer les distributions d'un trimestre avant que les commandes de ces mois existent.
 *
 * Les dates sont des jours du calendrier (« 2026-12-01 »), sans heure ni fuseau : une
 * distribution a lieu un jour donné, quelle que soit l'heure du serveur.
 */

/** Jours de la semaine, numérotés comme en France et dans la norme ISO : 1 = lundi … 7 = dimanche. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Mois au format « AAAA-MM » (« 2026-12 »), ou null si la saisie n'en est pas un. */
export function parseMonth(input: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
}

/** Mois décalé de `delta` mois : addMonths("2026-12", 1) → « 2027-01 ». */
export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Mois d'un jour : monthOf("2026-12-08") → « 2026-12 ». */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * Jours d'un mois qui tombent le jour de la semaine demandé (4 ou 5 dates).
 *
 * @example distributionDates("2026-12", 2) // mardis : ["2026-12-01", "2026-12-08", …, "2026-12-29"]
 */
export function distributionDates(month: string, weekday: Weekday): string[] {
  const [year, m] = month.split("-").map(Number) as [number, number];
  // Calcul en UTC : on ne manipule que des jours, jamais d'heures (pas d'effet de fuseau).
  const first = new Date(Date.UTC(year, m - 1, 1));
  const isoDay = ((first.getUTCDay() + 6) % 7) + 1; // 1 = lundi … 7 = dimanche
  const offset = (weekday - isoDay + 7) % 7;
  const dates: string[] = [];
  for (let day = 1 + offset; ; day += 7) {
    const date = new Date(Date.UTC(year, m - 1, day));
    if (date.getUTCMonth() !== m - 1) break;
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

/** Heure au format « HH:MM » (00:00 à 23:59). */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

/** La distribution commence avant de finir (même jour). */
export function isValidTimeRange(start: string, end: string): boolean {
  return isValidTime(start) && isValidTime(end) && start < end;
}

/**
 * Motif de fermeture d'une distribution : obligatoire (il apparaîtra aux familles et aux
 * producteurs), 120 caractères au plus. Renvoie le motif nettoyé, ou null s'il est refusé.
 */
export function closedReason(input: string): string | null {
  const reason = input.trim().replace(/\s+/g, " ");
  return reason.length >= 1 && reason.length <= 120 ? reason : null;
}

/**
 * Date de la même semaine (du lundi au dimanche) qui tombe le jour demandé : sert à déplacer une
 * distribution quand l'AMAP change de jour habituel.
 *
 * @example sameWeekDate("2026-12-08", 4) // mardi 8 → jeudi « 2026-12-10 »
 * @example sameWeekDate("2026-12-10", 2) // jeudi 10 → mardi « 2026-12-08 »
 */
export function sameWeekDate(date: string, weekday: Weekday): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const current = new Date(Date.UTC(year, month - 1, day));
  const isoDay = ((current.getUTCDay() + 6) % 7) + 1; // 1 = lundi … 7 = dimanche
  current.setUTCDate(current.getUTCDate() + (weekday - isoDay));
  return current.toISOString().slice(0, 10);
}
