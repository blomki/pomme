/**
 * Création d'une AMAP par le gestionnaire de la plateforme (story J1, ADR 0031) : contrôle des
 * champs du formulaire, avant l'appel à la fonction de base create_amap. L'adresse, la couleur
 * et l'heure ont leurs propres règles (amap-slug.ts, distributions.ts).
 */

import { validateAmapSlug, type AmapSlugError } from "./amap-slug";
import { isValidTime, isValidTimeRange } from "./distributions";

/** Fuseaux horaires proposés : la France métropolitaine et les territoires d'outre-mer. */
export const AMAP_TIMEZONES = [
  "Europe/Paris",
  "America/Guadeloupe",
  "America/Martinique",
  "America/Cayenne",
  "Indian/Reunion",
  "Indian/Mayotte",
  "Pacific/Noumea",
  "Pacific/Tahiti",
] as const;

export const MAX_AMAP_NAME_LENGTH = 80;
export const MAX_PLACE_LENGTH = 200;

export type NewAmap = {
  name: string;
  slug: string;
  colors: { primary: string; secondary: string; tertiary: string };
  place: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type NewAmapProblem =
  | { field: "name"; problem: "required" | "too_long" }
  | { field: "slug"; problem: AmapSlugError }
  | { field: "primary" | "secondary" | "tertiary"; problem: "color" }
  | { field: "place"; problem: "required" | "too_long" }
  | { field: "weekday"; problem: "weekday" }
  | { field: "startTime" | "endTime"; problem: "time" }
  | { field: "endTime"; problem: "end_before_start" }
  | { field: "timezone"; problem: "timezone" };

/** Couleur « #rrggbb ». */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Contrôle d'une nouvelle AMAP : nom, adresse, couleurs clés, lieu, jour et horaires de
 * distribution, fuseau. Renvoie la liste des problèmes, vide si tout est bon.
 *
 * @example checkNewAmap({ name: "", … }) // [{ field: "name", problem: "required" }, …]
 */
export function checkNewAmap(input: NewAmap): NewAmapProblem[] {
  const problems: NewAmapProblem[] = [];
  const name = input.name.trim();
  if (name === "") problems.push({ field: "name", problem: "required" });
  else if (name.length > MAX_AMAP_NAME_LENGTH)
    problems.push({ field: "name", problem: "too_long" });

  const slugError = validateAmapSlug(input.slug);
  if (slugError) problems.push({ field: "slug", problem: slugError });

  for (const field of ["primary", "secondary", "tertiary"] as const) {
    if (!isHexColor(input.colors[field])) problems.push({ field, problem: "color" });
  }

  const place = input.place.trim();
  if (place === "") problems.push({ field: "place", problem: "required" });
  else if (place.length > MAX_PLACE_LENGTH) problems.push({ field: "place", problem: "too_long" });

  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    problems.push({ field: "weekday", problem: "weekday" });
  }
  for (const field of ["startTime", "endTime"] as const) {
    if (!isValidTime(input[field])) problems.push({ field, problem: "time" });
  }
  if (
    isValidTime(input.startTime) &&
    isValidTime(input.endTime) &&
    !isValidTimeRange(input.startTime, input.endTime)
  ) {
    problems.push({ field: "endTime", problem: "end_before_start" });
  }

  if (!(AMAP_TIMEZONES as readonly string[]).includes(input.timezone)) {
    problems.push({ field: "timezone", problem: "timezone" });
  }
  return problems;
}
