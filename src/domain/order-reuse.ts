/**
 * « Reprendre ma commande du mois précédent » (story D4, ADR 0039) : recopier les quantités du
 * mois précédent sur la commande du mois ouvert, produit par produit, semaine par semaine.
 *
 * Correspondance des semaines : la 1re distribution du nouveau mois reprend la 1re du mois
 * précédent, la 2e la 2e, etc. Une semaine de plus (mois de cinq distributions) reprend la
 * dernière semaine du mois précédent. Ainsi une famille qui ne commande qu'une semaine sur deux
 * garde son rythme.
 */

/** Ce que le foyer a commandé le mois précédent, pour un produit. */
export type PreviousProduct = {
  productId: string;
  name: string;
  producerName: string;
  /** Quantité par distribution du mois précédent, dans l'ordre des dates (0 : rien). */
  byWeek: number[];
};

/** Un produit du catalogue du mois ouvert, avec ses cases. */
export type CurrentProduct = {
  productId: string;
  catalogItemId: string;
  /** Une case par distribution du mois ouvert, dans l'ordre ; `open` : modifiable et disponible. */
  cells: Array<{ distributionId: string; open: boolean }>;
};

export type ReusePlan = {
  /** Quantités à enregistrer, case par case. */
  lines: Array<{ catalogItemId: string; distributionId: string; quantity: number }>;
  /** Produits repris, avec la quantité totale du mois. */
  copied: Array<{ name: string; producerName: string; quantity: number }>;
  /** Produits qui ne sont plus au catalogue : pas recopiés. */
  missing: Array<{ name: string; producerName: string }>;
  /** Produits repris en partie : indisponibles certaines semaines. */
  partial: Array<{ name: string; producerName: string }>;
};

/**
 * Plan de reprise : rien n'est enregistré ici, l'écran le montre d'abord à la famille.
 *
 * @example planReuse([{ productId: "p", name: "Œufs", producerName: "Ferme", byWeek: [1, 0] }], [...])
 */
export function planReuse(previous: PreviousProduct[], current: CurrentProduct[]): ReusePlan {
  const plan: ReusePlan = { lines: [], copied: [], missing: [], partial: [] };
  for (const product of previous) {
    if (!product.byWeek.some((q) => q > 0)) continue;
    const label = { name: product.name, producerName: product.producerName };
    const target = current.find((c) => c.productId === product.productId);
    if (!target) {
      plan.missing.push(label);
      continue;
    }
    let total = 0;
    let skipped = false;
    target.cells.forEach((cell, week) => {
      const quantity = product.byWeek[Math.min(week, product.byWeek.length - 1)] ?? 0;
      if (quantity <= 0) return;
      if (!cell.open) {
        skipped = true;
        return;
      }
      plan.lines.push({
        catalogItemId: target.catalogItemId,
        distributionId: cell.distributionId,
        quantity,
      });
      total += quantity;
    });
    if (total > 0) plan.copied.push({ ...label, quantity: total });
    if (skipped) (total > 0 ? plan.partial : plan.missing).push(label);
  }
  return plan;
}
