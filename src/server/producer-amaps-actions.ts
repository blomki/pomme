"use server";

import { revalidatePath } from "next/cache";

import { chooseCurrentProducerAmap, type ChooseAmapResult } from "./producer-amaps";
import { requireSession } from "./auth/session";

/**
 * Liste « AMAP courante » de l'accueil du producteur (story C4). Pas de requireRole : le choix
 * ne concerne aucune AMAP en particulier, il est gardé sur le compte. chooseCurrentProducerAmap
 * vérifie que l'AMAP est bien l'une de celles que livre le producteur du compte.
 */
export async function chooseCurrentProducerAmapAction(
  input: Record<string, unknown>,
): Promise<ChooseAmapResult> {
  const current = await requireSession();
  const result = await chooseCurrentProducerAmap(current.user.id, input);
  // Tout l'espace change : thème, catalogue, tâches de l'accueil.
  if (result.status === "saved") revalidatePath("/producteur", "layout");
  return result;
}
