/**
 * Producteurs et référents (story C1).
 *
 * Le producteur est commun à la plateforme ; dans chaque AMAP, il a ses réglages (ordre des
 * chèques, distance, actif) et un ou plusieurs référents, qui pointent ses chèques et gèrent
 * ses avoirs. Un producteur actif sans référent est une tâche « Bloquant » pour l'admin :
 * personne ne pointerait ses chèques.
 */

export type ProducerReferents = {
  name: string;
  active: boolean;
  referentCount: number;
};

/**
 * Producteurs actifs sans aucun référent, par nom. Un producteur inactif (qui ne livre plus
 * pour l'instant) n'est pas signalé.
 */
export function producersWithoutReferent<T extends ProducerReferents>(
  producers: readonly T[],
): T[] {
  return producers
    .filter((p) => p.active && p.referentCount === 0)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Peut-on retirer le rôle de référent à cette personne ? Non tant qu'elle suit des
 * producteurs : il faut d'abord les confier à quelqu'un d'autre, pour qu'aucun ne se
 * retrouve sans référent par surprise.
 */
export function canRevokeReferent(assignedProducers: readonly string[]): boolean {
  return assignedProducers.length === 0;
}

/**
 * Distance de la ferme à l'AMAP, saisie en kilomètres (entier, facultatif). Renvoie null pour
 * un champ vide, undefined si la saisie n'est pas valable.
 *
 * @example parseDistanceKm("12") // 12
 * @example parseDistanceKm("") // null
 * @example parseDistanceKm("-3") // undefined
 */
export function parseDistanceKm(input: string): number | null | undefined {
  const text = input.trim();
  if (text === "") return null;
  if (!/^\d{1,4}$/.test(text)) return undefined;
  const km = Number(text);
  return km <= 1000 ? km : undefined;
}
