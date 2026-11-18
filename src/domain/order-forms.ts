/**
 * Bon de commande d'un producteur pour un mois (story E1, ADR 0019) : ce qu'il doit préparer
 * pour chaque distribution, et le détail par foyer. Calculé à partir des lignes de commande ;
 * montants en centimes, au prix gardé sur chaque ligne (ADR 0015).
 */

import { formatEuros, priceInput } from "./catalog";

export type FormDistribution = { id: string; date: string };
export type FormItem = { itemId: string; name: string; priceCents: number };
export type FormLine = {
  householdId: string;
  itemId: string;
  distributionId: string;
  quantity: number;
  unitPriceCents: number;
};
export type FormHousehold = {
  id: string;
  name: string;
  /** Chèque calculé à la clôture (avoirs déduits), ou null avant la clôture. */
  cheque: { creditsCents: number; expectedCents: number } | null;
};

export type OrderFormProduct = {
  itemId: string;
  name: string;
  priceCents: number;
  /** Quantité par distribution, dans l'ordre de `distributions`. */
  perDistribution: number[];
  totalQuantity: number;
  amountCents: number;
};

export type OrderFormHousehold = {
  id: string;
  name: string;
  rows: Array<{ itemId: string; name: string; perDistribution: number[] }>;
  grossCents: number;
  creditsCents: number | null;
  expectedCents: number;
};

export type OrderForm = {
  distributions: FormDistribution[];
  products: OrderFormProduct[];
  households: OrderFormHousehold[];
  totalCents: number;
};

/**
 * Assemble le bon de commande. Seuls les produits et les foyers qui ont au moins une quantité
 * y figurent ; les produits dans l'ordre du catalogue, les foyers par nom.
 */
export function buildOrderForm(input: {
  distributions: readonly FormDistribution[];
  items: readonly FormItem[];
  lines: readonly FormLine[];
  households: readonly FormHousehold[];
}): OrderForm {
  const lines = input.lines.filter((l) => l.quantity > 0);
  const distributions = [...input.distributions];
  const count = (filter: (l: FormLine) => boolean) =>
    distributions.map((d) =>
      lines
        .filter((l) => l.distributionId === d.id && filter(l))
        .reduce((sum, l) => sum + l.quantity, 0),
    );
  const amount = (subset: readonly FormLine[]) =>
    subset.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);

  const products = input.items
    .map((item) => {
      const own = lines.filter((l) => l.itemId === item.itemId);
      const perDistribution = count((l) => l.itemId === item.itemId);
      return {
        ...item,
        perDistribution,
        totalQuantity: perDistribution.reduce((a, b) => a + b, 0),
        amountCents: amount(own),
      };
    })
    .filter((p) => p.totalQuantity > 0);

  const households = input.households
    .map((h) => {
      const own = lines.filter((l) => l.householdId === h.id);
      const grossCents = amount(own);
      return {
        id: h.id,
        name: h.name,
        rows: input.items
          .map((item) => ({
            itemId: item.itemId,
            name: item.name,
            perDistribution: count((l) => l.householdId === h.id && l.itemId === item.itemId),
          }))
          .filter((row) => row.perDistribution.some((q) => q > 0)),
        grossCents,
        creditsCents: h.cheque ? h.cheque.creditsCents : null,
        expectedCents: h.cheque ? h.cheque.expectedCents : grossCents,
      };
    })
    .filter((h) => h.rows.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return {
    distributions,
    products,
    households,
    totalCents: products.reduce((sum, p) => sum + p.amountCents, 0),
  };
}

/**
 * Cellule de tableur : entre guillemets si besoin, et neutralisée si elle commence comme une
 * formule (« = + - @ ») : un nom de foyer ne doit jamais s'exécuter dans le tableur.
 */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Libellés du tableur, fournis par l'appelant (textes de l'interface, en français). */
export type OrderFormCsvLabels = {
  title: string;
  product: string;
  price: string;
  total: string;
  amount: string;
  household: string;
  credit: string;
  expected: string;
  /** Intitulé de colonne d'une distribution (« 3 déc. »). */
  day: (date: string) => string;
};

/**
 * Bon de commande au format tableur (CSV à la française : « ; » entre les colonnes, virgule
 * décimale, encodage UTF-8 avec BOM pour qu'Excel lise les accents). Deux blocs : les quantités
 * à préparer, puis le détail par foyer.
 */
export function orderFormCsv(form: OrderForm, labels: OrderFormCsvLabels): string {
  const days = form.distributions.map((d) => labels.day(d.date));
  const rows: Array<Array<string | number>> = [
    [labels.title],
    [],
    [labels.product, labels.price, ...days, labels.total, labels.amount],
    ...form.products.map((p) => [
      p.name,
      priceInput(p.priceCents),
      ...p.perDistribution,
      p.totalQuantity,
      priceInput(p.amountCents),
    ]),
    [labels.total, "", ...days.map(() => ""), "", priceInput(form.totalCents)],
    [],
    [labels.household, labels.product, ...days, labels.credit, labels.expected],
  ];
  for (const h of form.households) {
    h.rows.forEach((row, index) => {
      const last = index === 0;
      rows.push([
        h.name,
        row.name,
        ...row.perDistribution,
        last && h.creditsCents ? priceInput(h.creditsCents) : "",
        last ? priceInput(h.expectedCents) : "",
      ]);
    });
  }
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

/** Montant affiché d'un avoir : « − 4,00 € », ou un tiret sans avoir. */
export function creditLabel(creditsCents: number | null): string {
  return creditsCents ? `− ${formatEuros(creditsCents)}` : "—";
}
