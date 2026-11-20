/**
 * Feuille d'émargement du mois (story E3, ADR 0027) : imprimée par l'admin, remplie à la main
 * pendant les distributions. Deux parties : (1) livraisons par producteur, (2) retraits par
 * foyer, produits groupés par producteur. Pour chaque distribution du mois (une colonne par
 * semaine), une case « Cmd » (quantité commandée, fond gris) et une case « ± » (écart noté par
 * les bénévoles). Les écarts remontent ensuite par les signalements (F5).
 */

export type SheetDistribution = { id: string; date: string };

export type SheetLine = {
  householdId: string;
  householdName: string;
  producerName: string;
  productName: string;
  distributionId: string;
  quantity: number;
};

/** Une ligne de produit : quantité par distribution, dans l'ordre des colonnes (0 : rien). */
export type SheetRow = { productName: string; perDistribution: number[] };

export type SignInSheet = {
  distributions: SheetDistribution[];
  /** Partie 1 : par producteur, puis par produit (ordre alphabétique). */
  producers: Array<{ name: string; rows: SheetRow[] }>;
  /** Partie 2 : par foyer, puis par producteur, puis par produit (ordre alphabétique). */
  households: Array<{
    id: string;
    name: string;
    producers: Array<{ name: string; rows: SheetRow[] }>;
  }>;
};

const byName = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" });

/** Regroupe des lignes par produit : une ligne par produit, quantités additionnées par semaine. */
function rowsOf(
  lines: readonly SheetLine[],
  distributions: readonly SheetDistribution[],
): SheetRow[] {
  const products = [...new Set(lines.map((l) => l.productName))].sort(byName);
  return products.map((productName) => ({
    productName,
    perDistribution: distributions.map((d) =>
      lines
        .filter((l) => l.productName === productName && l.distributionId === d.id)
        .reduce((sum, l) => sum + l.quantity, 0),
    ),
  }));
}

/**
 * Assemble la feuille. Seules les lignes de quantité positive, aux distributions du mois, y
 * figurent ; un producteur ou un foyer sans rien à livrer ou à retirer n'a pas de bloc.
 */
export function buildSignInSheet(input: {
  distributions: readonly SheetDistribution[];
  lines: readonly SheetLine[];
}): SignInSheet {
  const distributions = [...input.distributions].sort((a, b) => a.date.localeCompare(b.date));
  const ids = new Set(distributions.map((d) => d.id));
  const lines = input.lines.filter((l) => l.quantity > 0 && ids.has(l.distributionId));

  const producerNames = [...new Set(lines.map((l) => l.producerName))].sort(byName);
  const producers = producerNames.map((name) => ({
    name,
    rows: rowsOf(
      lines.filter((l) => l.producerName === name),
      distributions,
    ),
  }));

  const householdIds = [...new Map(lines.map((l) => [l.householdId, l.householdName]))].sort(
    (a, b) => byName(a[1], b[1]),
  );
  const households = householdIds.map(([id, name]) => {
    const own = lines.filter((l) => l.householdId === id);
    return {
      id,
      name,
      producers: [...new Set(own.map((l) => l.producerName))].sort(byName).map((producer) => ({
        name: producer,
        rows: rowsOf(
          own.filter((l) => l.producerName === producer),
          distributions,
        ),
      })),
    };
  });

  return { distributions, producers, households };
}
