/**
 * Commande du mois d'un foyer (story D3, ADR 0018). Une quantité par produit et par
 * distribution ; le prix est celui du catalogue au moment de la saisie (ADR 0015). Montants en
 * centimes entiers.
 */

/** Quantité maximale par produit et par distribution : au-delà, sans doute une faute de frappe. */
export const MAX_QUANTITY = 99;

/**
 * Quantité saisie : nombre entier de 0 à 99. Champ vide → 0. null si la saisie n'est pas
 * valable.
 *
 * @example parseQuantity("2") // 2
 * @example parseQuantity("") // 0
 * @example parseQuantity("1,5") // null
 */
export function parseQuantity(input: string): number | null {
  const text = input.trim();
  if (text === "") return 0;
  if (!/^\d{1,2}$/.test(text)) return null;
  return Number(text);
}

/**
 * État d'un producteur dans la commande du foyer :
 * - complete (complété) : au moins une quantité ;
 * - nothing (rien ce mois-ci) : le foyer l'a choisi, aucune quantité ;
 * - todo (à compléter) : ni l'un ni l'autre.
 */
export type ProducerOrderStatus = "complete" | "nothing" | "todo";

export function producerOrderStatus(params: {
  quantities: readonly number[];
  declined: boolean;
}): ProducerOrderStatus {
  if (params.quantities.some((q) => q > 0)) return "complete";
  return params.declined ? "nothing" : "todo";
}

/** Nombre de producteurs « traités » (complété ou rien ce mois-ci) : « 3 producteurs sur 4 ». */
export function treatedCount(statuses: readonly ProducerOrderStatus[]): number {
  return statuses.filter((s) => s !== "todo").length;
}

export type PricedQuantity = { quantity: number; unitPriceCents: number };

/** Total en centimes de lignes de commande. */
export function linesTotal(lines: readonly PricedQuantity[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
}

/** Pourquoi une case (produit × distribution) ne peut pas être modifiée. */
export type LockReason =
  | "unavailable" // produit indisponible à cette distribution, ou distribution fermée
  | "past" // distribution passée (ou du jour même)
  | "cheque_received"; // chèque déjà pointé chez ce producteur : commande figée

/**
 * Peut-on modifier la quantité d'un produit pour une distribution ? Les distributions passées
 * et celle du jour ne se modifient plus : le producteur prépare déjà. Un chèque pointé fige
 * la commande chez ce producteur (règle métier 3, après une réouverture).
 *
 * @param today jour de Paris, « AAAA-MM-JJ »
 */
export function cellLock(params: {
  distributionDate: string;
  today: string;
  available: boolean;
  chequeReceived: boolean;
}): LockReason | null {
  if (params.chequeReceived) return "cheque_received";
  if (params.distributionDate <= params.today) return "past";
  if (!params.available) return "unavailable";
  return null;
}
