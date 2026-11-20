/**
 * « À préparer » du producteur (story E5, ADR 0028) : pour une distribution, les quantités à
 * préparer par produit, puis la liste par foyer pour étiqueter les paniers. Calculé à partir du
 * bon de commande du mois (order-forms.ts), une fois les commandes clôturées.
 */

import type { OrderForm } from "./order-forms";

export type WeekToPrepare = {
  /** Totaux à préparer, dans l'ordre du catalogue. */
  products: Array<{ name: string; quantity: number }>;
  /** Un panier par foyer, par nom, avec ses produits. */
  households: Array<{ name: string; items: Array<{ name: string; quantity: number }> }>;
};

/** La colonne d'une distribution du bon de commande du mois. Vide si elle n'y figure pas. */
export function weekToPrepare(form: OrderForm, distributionId: string): WeekToPrepare {
  const column = form.distributions.findIndex((d) => d.id === distributionId);
  if (column === -1) return { products: [], households: [] };
  const products = form.products
    .map((p) => ({ name: p.name, quantity: p.perDistribution[column] ?? 0 }))
    .filter((p) => p.quantity > 0);
  const households = form.households
    .map((h) => ({
      name: h.name,
      items: h.rows
        .map((r) => ({ name: r.name, quantity: r.perDistribution[column] ?? 0 }))
        .filter((i) => i.quantity > 0),
    }))
    .filter((h) => h.items.length > 0);
  return { products, households };
}

/**
 * Semaine proposée par défaut : la prochaine distribution (aujourd'hui compris), sinon la plus
 * récente. null s'il n'y en a aucune.
 *
 * @param weeks distributions disponibles, dans l'ordre des dates
 */
export function defaultWeek(
  weeks: ReadonlyArray<{ id: string; date: string }>,
  today: string,
): string | null {
  return (weeks.find((w) => w.date >= today) ?? weeks.at(-1))?.id ?? null;
}
