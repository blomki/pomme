"use server";

import { runAmapAction } from "./amap-action";
import {
  handOverCheques,
  markChequeReceived,
  settleChequeGap,
  unmarkChequeReceived,
  type HandOverResult,
  type PointageResult,
} from "./cheques";

// Actions de l'écran « Pointage des chèques » (story F1). Chacune : contexte de l'AMAP de
// l'adresse, puis cheques.ts, qui vérifie le droit (référent du producteur ou admin) et
// journalise. Pas de revalidatePath : l'écran met à jour la ligne avec la réponse.

type Forbidden = { status: "forbidden" };
const chequesPath = (amap: string) => `/${amap}/referent/cheques`;

/** « Reçu » coché, ou montant / numéro corrigé. */
export async function markChequeReceivedAction(
  amap: string,
  input: { chequeId: string; receivedCents?: number; chequeNumber?: string },
): Promise<PointageResult | Forbidden> {
  const outcome = await runAmapAction(amap, chequesPath(amap), (tx, ctx) =>
    markChequeReceived(tx, ctx, input),
  );
  return "status" in outcome ? outcome : outcome.result;
}

/** « Reçu » décoché : le chèque redevient attendu. */
export async function unmarkChequeReceivedAction(
  amap: string,
  chequeId: string,
): Promise<PointageResult | Forbidden> {
  const outcome = await runAmapAction(amap, chequesPath(amap), (tx, ctx) =>
    unmarkChequeReceived(tx, ctx, { chequeId }),
  );
  return "status" in outcome ? outcome : outcome.result;
}

/** Écart traité, ou de nouveau à traiter. */
export async function settleChequeGapAction(
  amap: string,
  input: { chequeId: string; settled: boolean },
): Promise<PointageResult | { status: "no_gap" } | Forbidden> {
  const outcome = await runAmapAction(amap, chequesPath(amap), (tx, ctx) =>
    settleChequeGap(tx, ctx, input),
  );
  return "status" in outcome ? outcome : outcome.result;
}

/** Remise au producteur des chèques reçus d'un mois (story F3). */
export async function handOverChequesAction(
  amap: string,
  input: { amapProducerId: string; month: string },
): Promise<HandOverResult | Forbidden> {
  const outcome = await runAmapAction(amap, chequesPath(amap), (tx, ctx) =>
    handOverCheques(tx, ctx, input),
  );
  return "status" in outcome ? outcome : outcome.result;
}
