"use server";

import { revalidatePath } from "next/cache";

import { runAmapAction } from "./amap-action";
import { saveCatalogDraft, type SaveDraftResult } from "./catalogs";

// Action des écrans « Catalogue du mois » du référent (R6) et du producteur (P2), story C2.
// saveCatalogDraft vérifie que l'utilisateur est le référent du producteur, ou le producteur
// lui-même. `amap` : adresse de l'AMAP du catalogue (le producteur la choisit à l'écran).

/** « Enregistrer le brouillon » du catalogue d'un mois. */
export async function saveCatalogDraftAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveDraftResult | { status: "forbidden" }> {
  const path = `/${amap}/referent/catalogue`;
  const outcome = await runAmapAction(amap, path, (tx, ctx) => saveCatalogDraft(tx, ctx, input));
  if ("status" in outcome) return outcome;
  // Les deux écrans montrent le même catalogue.
  revalidatePath(path);
  revalidatePath("/producteur/catalogue");
  return outcome.result;
}
