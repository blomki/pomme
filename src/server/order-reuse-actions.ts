"use server";

import { revalidatePath } from "next/cache";

import { runAmapAction } from "./amap-action";
import {
  applyOrderReuse,
  planOrderReuse,
  type ApplyReuseResult,
  type ReusePreview,
} from "./order-reuse";

// Actions de « Reprendre ma commande du mois précédent » (story D4) : aperçu, puis recopie après
// confirmation. Le foyer est celui du compte connecté (order-reuse.ts).

type Forbidden = { status: "forbidden" };
const orderPath = (amap: string) => `/${amap}/famille/commande`;

/** Ce qui serait recopié, sans rien enregistrer. */
export async function previewOrderReuseAction(amap: string): Promise<ReusePreview | Forbidden> {
  const outcome = await runAmapAction(amap, orderPath(amap), (tx, ctx) => planOrderReuse(tx, ctx));
  return "status" in outcome ? outcome : outcome.result;
}

/** Recopie, après confirmation de la famille. */
export async function applyOrderReuseAction(amap: string): Promise<ApplyReuseResult | Forbidden> {
  const outcome = await runAmapAction(amap, orderPath(amap), (tx, ctx) => applyOrderReuse(tx, ctx));
  if ("status" in outcome) return outcome;
  revalidatePath(orderPath(amap), "layout");
  return outcome.result;
}
