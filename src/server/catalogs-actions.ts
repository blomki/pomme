"use server";

import { revalidatePath } from "next/cache";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";

import { runAmapAction } from "./amap-action";
import {
  copyPreviousCatalog,
  publishCatalog,
  saveCatalogDraft,
  type CopyResult,
  type PublishResult,
  type SaveDraftResult,
} from "./catalogs";

// Actions des écrans « Catalogue du mois » du référent (R6) et du producteur (P2), stories C2
// et C3. Chaque fonction de catalogs.ts vérifie que l'utilisateur est le référent du
// producteur, ou le producteur lui-même. `amap` : adresse de l'AMAP du catalogue (le producteur
// la choisit à l'écran).

type Forbidden = { status: "forbidden" };

/** Exécute une action du catalogue, puis rafraîchit les deux écrans (même catalogue). */
async function catalogAction<T>(
  amap: string,
  fn: (tx: Transaction, ctx: AmapContext) => Promise<T>,
): Promise<T | Forbidden> {
  const path = `/${amap}/referent/catalogue`;
  const outcome = await runAmapAction(amap, path, fn);
  if ("status" in outcome) return outcome;
  revalidatePath(path);
  revalidatePath("/producteur/catalogue");
  return outcome.result;
}

/** « Enregistrer le brouillon » du catalogue d'un mois. */
export async function saveCatalogDraftAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveDraftResult | Forbidden> {
  return catalogAction(amap, (tx, ctx) => saveCatalogDraft(tx, ctx, input));
}

/** « Préparer à partir de [mois précédent] ». */
export async function copyPreviousCatalogAction(
  amap: string,
  input: { amapProducerId: string; month: string },
): Promise<CopyResult | Forbidden> {
  return catalogAction(amap, (tx, ctx) => copyPreviousCatalog(tx, ctx, input));
}

/** « Publier pour [mois] » (après enregistrement du brouillon). */
export async function publishCatalogAction(
  amap: string,
  input: { amapProducerId: string; month: string },
): Promise<PublishResult | Forbidden> {
  return catalogAction(amap, (tx, ctx) => publishCatalog(tx, ctx, input));
}
