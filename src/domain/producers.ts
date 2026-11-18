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

/**
 * Accès du producteur à Pomme, affiché à l'admin :
 * - « active » (compte actif) : au moins un de ses comptes s'est déjà connecté ;
 * - « invited » (invitation envoyée) : il a un compte, jamais utilisé ;
 * - « none » (pas de compte).
 */
export type ProducerAccess = "active" | "invited" | "none";

export function producerAccess(
  accounts: ReadonlyArray<{ emailVerified: boolean }>,
): ProducerAccess {
  if (accounts.some((account) => account.emailVerified)) return "active";
  return accounts.length > 0 ? "invited" : "none";
}

/**
 * AMAP courante de l'espace producteur (story C4) : celle choisie et gardée avec le compte si
 * elle est toujours dans sa liste, sinon la première (liste par nom d'AMAP). Un lien retiré
 * depuis (producteur inactif dans cette AMAP, par exemple) ne bloque donc jamais l'écran.
 * `undefined` seulement pour une liste vide.
 */
export function pickCurrentAmap<T extends { amapProducerId: string }>(
  amaps: readonly T[],
  chosenId: string | null,
): T | undefined {
  return amaps.find((a) => a.amapProducerId === chosenId) ?? amaps[0];
}

/** Ce que l'accueil du producteur met en avant : publier le catalogue d'un mois. */
export type ProducerHomeTask = {
  /** Mois du catalogue à publier, « AAAA-MM ». */
  month: string;
  /** Jour d'ouverture des commandes (« AAAA-MM-JJ »), ou null si l'admin ne l'a pas encore fixé. */
  opensOn: string | null;
  /** Commandes déjà ouvertes : les familles commandent sans les produits de ce producteur. */
  ordersOpen: boolean;
};

/**
 * Seule action datée du producteur sur son accueil (story C4) : publier son catalogue avant
 * l'ouverture des commandes du mois.
 *
 * Le mois visé est celui de la première période de commande pas encore clôturée ; sans
 * période, le mois prochain (l'admin n'a pas encore fixé les dates). Rien à faire si ce
 * catalogue est publié, ou si les commandes de ce mois sont déjà clôturées.
 *
 * @param periods périodes de l'AMAP, avec leur état calculé à l'heure actuelle
 * @param publishedMonths mois (« AAAA-MM ») dont le catalogue du producteur est publié
 */
export function producerHomeTask(params: {
  nextMonth: string;
  periods: ReadonlyArray<{
    month: string;
    opensOn: string;
    status: "scheduled" | "open" | "closed";
  }>;
  publishedMonths: readonly string[];
}): ProducerHomeTask | null {
  const { nextMonth, periods, publishedMonths } = params;
  const pending = periods
    .filter((p) => p.status !== "closed")
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  if (!pending && periods.some((p) => p.month === nextMonth)) return null;

  const task: ProducerHomeTask = pending
    ? { month: pending.month, opensOn: pending.opensOn, ordersOpen: pending.status === "open" }
    : { month: nextMonth, opensOn: null, ordersOpen: false };
  return publishedMonths.includes(task.month) ? null : task;
}
