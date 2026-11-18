/**
 * Accueil de la famille (story D6) : quelle période de commande mettre en avant.
 *
 * 1. Une période ouverte : « Commande de décembre », à passer ou déjà passée.
 * 2. Sinon, la dernière période clôturée dont le mois n'est pas fini : les chèques à préparer
 *    et la distribution où les remettre.
 * 3. Sinon, la prochaine période prévue : « ouverture le … ».
 * 4. Sinon, rien.
 */

export type HomePeriodInput = {
  id: string;
  /** Mois commandé, « AAAA-MM ». */
  month: string;
  /** État à l'instant présent (calculé par l'heure, ADR 0015). */
  status: "scheduled" | "open" | "closed";
};

export function homePeriod<T extends HomePeriodInput>(
  periods: readonly T[],
  currentMonth: string,
): { period: T; phase: "open" | "closed" | "scheduled" } | null {
  const byMonth = [...periods].sort((a, b) => a.month.localeCompare(b.month));
  const open = byMonth.find((p) => p.status === "open");
  if (open) return { period: open, phase: "open" };
  const closed = byMonth.filter((p) => p.status === "closed" && p.month >= currentMonth).at(-1);
  if (closed) return { period: closed, phase: "closed" };
  const scheduled = byMonth.find((p) => p.status === "scheduled");
  if (scheduled) return { period: scheduled, phase: "scheduled" };
  return null;
}
