/**
 * Planning des permanences du trimestre (story G2, ADR 0043) : génération automatique, contrôles
 * de l'éditeur et répartition. Fonctions pures : la base est lue et écrite par server/.
 *
 * Règles (cahier des charges, story G2) :
 * - N bénévoles par distribution (réglage de l'AMAP, 3 par défaut) ;
 * - répartition équitable : on choisit toujours les personnes qui ont le moins de permanences
 *   sur le trimestre ;
 * - chaque nouveau (moins de 6 permanences faites, antériorité AmapJ comprise) est accompagné
 *   d'au moins un expérimenté ;
 * - les indisponibilités déclarées (G1) sont respectées ; sans réponse = disponible partout.
 */

export type PlanningPerson = {
  userId: string;
  /** Nom affiché, sert aussi à départager dans un ordre stable. */
  name: string;
  /** Permanences déjà faites : antériorité importée + permanences passées dans Pomme. */
  experience: number;
  /** Distributions où la personne a déclaré être indisponible. */
  unavailable: readonly string[];
};

/** Une case du planning : la n-ième place (0, 1, 2…) d'une distribution. */
export type Assignment = { distributionId: string; position: number; userId: string };

/** Vrai à partir du seuil (6 permanences par défaut, réglage de l'AMAP). */
export function isExperienced(experience: number, threshold: number): boolean {
  return experience >= threshold;
}

/**
 * Génère le planning des distributions données, dans l'ordre des dates.
 *
 * Pour chaque distribution : d'abord l'expérimenté disponible le moins chargé (s'il y en a un),
 * puis les personnes disponibles les moins chargées. À charge égale, un nouveau passe avant un
 * expérimenté : les expérimentés, souvent peu nombreux, restent libres pour accompagner les
 * semaines suivantes. Puis celle dont la dernière permanence est la plus ancienne, puis le nom. `initialLoad` compte les permanences déjà
 * fixées sur le trimestre (mois passés, gardés tels quels).
 *
 * @example generatePlanning({ distributions: ["d1"], people, perDistribution: 3, threshold: 6 })
 */
export function generatePlanning(params: {
  distributions: readonly string[];
  people: readonly PlanningPerson[];
  perDistribution: number;
  threshold: number;
  initialLoad?: ReadonlyMap<string, number>;
}): Assignment[] {
  const load = new Map(
    params.people.map((p) => [p.userId, params.initialLoad?.get(p.userId) ?? 0]),
  );
  const lastSeen = new Map(params.people.map((p) => [p.userId, -1]));
  const result: Assignment[] = [];

  params.distributions.forEach((distributionId, index) => {
    const available = params.people.filter((p) => !p.unavailable.includes(distributionId));
    const experienced = (p: PlanningPerson) => isExperienced(p.experience, params.threshold);
    const byNeed = (a: PlanningPerson, b: PlanningPerson) =>
      load.get(a.userId)! - load.get(b.userId)! ||
      lastSeen.get(a.userId)! - lastSeen.get(b.userId)! ||
      a.name.localeCompare(b.name, "fr") ||
      a.userId.localeCompare(b.userId);
    const newFirst = (a: PlanningPerson, b: PlanningPerson) =>
      load.get(a.userId)! - load.get(b.userId)! ||
      Number(experienced(a)) - Number(experienced(b)) ||
      byNeed(a, b);
    const chosen: PlanningPerson[] = [];
    const firstExperienced = available.filter(experienced).sort(byNeed)[0];
    if (firstExperienced) chosen.push(firstExperienced);
    for (const person of [...available].sort(newFirst)) {
      if (chosen.length >= params.perDistribution) break;
      if (!chosen.includes(person)) chosen.push(person);
    }
    chosen.forEach((person, position) => {
      result.push({ distributionId, position, userId: person.userId });
      load.set(person.userId, load.get(person.userId)! + 1);
      lastSeen.set(person.userId, index);
    });
  });
  return result;
}

export type RowCheck =
  | { kind: "unavailable"; userId: string }
  | { kind: "duplicate"; userId: string }
  | { kind: "no_experienced" }
  | { kind: "missing"; count: number }
  | { kind: "accompanied" }
  | { kind: "ok" };

/**
 * Contrôle d'une ligne de l'éditeur (une distribution), du plus grave au moins grave :
 * personne indisponible, personne en double, nouveau sans expérimenté, places vides.
 */
export function checkRow(params: {
  distributionId: string;
  userIds: ReadonlyArray<string | null>;
  people: ReadonlyMap<string, PlanningPerson>;
  perDistribution: number;
  threshold: number;
}): RowCheck {
  const filled = params.userIds.filter((id): id is string => id !== null);
  const unavailable = filled.find((id) =>
    params.people.get(id)?.unavailable.includes(params.distributionId),
  );
  if (unavailable) return { kind: "unavailable", userId: unavailable };
  const duplicate = filled.find((id, i) => filled.indexOf(id) !== i);
  if (duplicate) return { kind: "duplicate", userId: duplicate };
  const experienced = (id: string) =>
    isExperienced(params.people.get(id)?.experience ?? 0, params.threshold);
  const hasNew = filled.some((id) => !experienced(id));
  if (hasNew && !filled.some(experienced)) return { kind: "no_experienced" };
  if (filled.length < params.perDistribution) {
    return { kind: "missing", count: params.perDistribution - filled.length };
  }
  return hasNew ? { kind: "accompanied" } : { kind: "ok" };
}

export type LoadLevel = "under" | "even" | "over";

/**
 * Répartition sur le trimestre : moyenne, et pour chacun s'il est dans la moyenne (arrondie
 * en dessous ou au-dessus), en dessous ou au-dessus.
 */
export function loadSpread(counts: ReadonlyMap<string, number>): {
  average: number;
  min: number;
  max: number;
  level: (userId: string) => LoadLevel;
} {
  const values = [...counts.values()];
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const [low, high] = [Math.floor(average), Math.ceil(average)];
  return {
    average,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    level: (userId) => {
      const n = counts.get(userId) ?? 0;
      return n < low ? "under" : n > high ? "over" : "even";
    },
  };
}

/**
 * Personnes concernées par un changement du planning : celles qui ont été retirées d'une case
 * ou ajoutées à une case. Sert à prévenir seulement elles.
 */
export function changedPeople(
  before: readonly Assignment[],
  after: readonly Assignment[],
): string[] {
  const key = (a: Assignment) => `${a.distributionId}:${a.userId}`;
  const was = new Set(before.map(key));
  const now = new Set(after.map(key));
  const changed = new Set<string>();
  for (const a of before) if (!now.has(key(a))) changed.add(a.userId);
  for (const a of after) if (!was.has(key(a))) changed.add(a.userId);
  return [...changed];
}

/**
 * Nombre de permanences de chacun sur un trimestre (story G3) : les cases dont la distribution
 * tombe dans le trimestre. Affiché entre parenthèses à côté du nom dans le calendrier du mois.
 */
export function quarterDutyCounts(
  slots: ReadonlyArray<{ userId: string; date: string }>,
  range: { from: string; to: string },
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of slots) {
    if (s.date < range.from || s.date >= range.to) continue;
    counts.set(s.userId, (counts.get(s.userId) ?? 0) + 1);
  }
  return counts;
}
