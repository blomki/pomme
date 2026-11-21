/**
 * Réglages d'une AMAP par ses administrateurs (story A4, ADR 0032) : nom affiché, couleurs clés,
 * police des titres, email de contact et paramètres (bénévoles, seuil « expérimenté », alerte
 * d'adhésion). L'adresse (slug) ne se change pas ici : seul le gestionnaire le peut. Le lieu et
 * les horaires de distribution se règlent depuis le planning (story D1).
 */

import { isHexColor, MAX_AMAP_NAME_LENGTH } from "./amap-creation";
import { MEMBERSHIP_EXPIRY_ALERT_DAYS } from "./memberships";

/** Valeurs par défaut des paramètres (cahier des charges). */
export const DEFAULT_AMAP_PARAMETERS = {
  volunteersPerDistribution: 3,
  experiencedThreshold: 6,
  membershipExpiryAlertDays: MEMBERSHIP_EXPIRY_ALERT_DAYS,
  // Rappel automatique aux foyers sans commande, ce nombre de jours avant la clôture (D5).
  orderReminderDays: 2,
} as const;

/** Bornes de chaque paramètre : de quoi refuser une faute de frappe (« 300 bénévoles »). */
export const AMAP_PARAMETER_BOUNDS = {
  volunteersPerDistribution: { min: 1, max: 20 },
  experiencedThreshold: { min: 1, max: 50 },
  membershipExpiryAlertDays: { min: 1, max: 180 },
  // 0 : pas de rappel automatique.
  orderReminderDays: { min: 0, max: 14 },
} as const;
export type AmapParameter = keyof typeof AMAP_PARAMETER_BOUNDS;

export type AmapSettingsInput = {
  name: string;
  colors: { primary: string; secondary: string; tertiary: string };
  parameters: Record<AmapParameter, number>;
};

export type AmapSettingsProblem =
  | { field: "name"; problem: "required" | "too_long" }
  | { field: "primary" | "secondary" | "tertiary"; problem: "color" }
  | { field: AmapParameter; problem: "range" };

/**
 * Contrôle des réglages : nom, couleurs « #rrggbb », paramètres entiers dans leurs bornes.
 *
 * @example checkAmapSettings({ …, parameters: { volunteersPerDistribution: 0, … } }) // [{ field: "volunteersPerDistribution", problem: "range" }]
 */
export function checkAmapSettings(input: AmapSettingsInput): AmapSettingsProblem[] {
  const problems: AmapSettingsProblem[] = [];
  const name = input.name.trim();
  if (name === "") problems.push({ field: "name", problem: "required" });
  else if (name.length > MAX_AMAP_NAME_LENGTH) {
    problems.push({ field: "name", problem: "too_long" });
  }
  for (const field of ["primary", "secondary", "tertiary"] as const) {
    if (!isHexColor(input.colors[field])) problems.push({ field, problem: "color" });
  }
  for (const field of Object.keys(AMAP_PARAMETER_BOUNDS) as AmapParameter[]) {
    const value = input.parameters[field];
    const { min, max } = AMAP_PARAMETER_BOUNDS[field];
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push({ field, problem: "range" });
    }
  }
  return problems;
}

/** Paramètres enregistrés, complétés par les valeurs par défaut. */
export function effectiveParameters(
  settings: Partial<Record<AmapParameter, number>> | null | undefined,
): Record<AmapParameter, number> {
  return {
    volunteersPerDistribution:
      settings?.volunteersPerDistribution ?? DEFAULT_AMAP_PARAMETERS.volunteersPerDistribution,
    experiencedThreshold:
      settings?.experiencedThreshold ?? DEFAULT_AMAP_PARAMETERS.experiencedThreshold,
    membershipExpiryAlertDays:
      settings?.membershipExpiryAlertDays ?? DEFAULT_AMAP_PARAMETERS.membershipExpiryAlertDays,
    orderReminderDays: settings?.orderReminderDays ?? DEFAULT_AMAP_PARAMETERS.orderReminderDays,
  };
}
