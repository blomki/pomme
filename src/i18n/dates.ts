import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { TIME_ZONE } from "./config";

/**
 * Formate une date en français, à l'heure de Paris.
 *
 * Pourquoi : le serveur tourne en UTC. Sans fuseau explicite, une distribution
 * du mardi à 0 h 30 heure de Paris serait affichée « lundi ».
 *
 * @example formatDate(new Date("2026-11-05T09:00:00Z")) // « 5 novembre 2026 »
 * @param pattern motif date-fns, par exemple "EEEE d MMMM" → « jeudi 5 novembre »
 */
export function formatDate(date: Date | number | string, pattern = "d MMMM yyyy"): string {
  return format(date, pattern, { locale: fr, in: tz(TIME_ZONE) });
}
