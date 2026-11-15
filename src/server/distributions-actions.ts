"use server";

import { revalidatePath } from "next/cache";

import { runAmapAction } from "./amap-action";
import {
  generateDistributions,
  saveDistributionSettings,
  setDistributionOpen,
  type GenerateResult,
  type SaveSettingsResult,
  type SetOpenResult,
} from "./distributions";

// Actions de l'écran « Planning des permanences » (story D1). Chacune : contexte de l'AMAP de
// l'adresse, puis fonction de distributions.ts (qui vérifie le rôle admin).

type Forbidden = { status: "forbidden" };
const planningPath = (slug: string) => `/${slug}/admin/planning`;

/** « Modifier les réglages » de la distribution habituelle. */
export async function saveDistributionSettingsAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveSettingsResult | Forbidden> {
  const outcome = await runAmapAction(amap, planningPath(amap), (tx, ctx) =>
    saveDistributionSettings(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(planningPath(amap));
  return outcome.result;
}

/** « Créer les distributions » d'un mois. */
export async function generateDistributionsAction(
  amap: string,
  month: string,
): Promise<GenerateResult | Forbidden> {
  const outcome = await runAmapAction(amap, planningPath(amap), (tx, ctx) =>
    generateDistributions(tx, ctx, { month }),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(planningPath(amap));
  return outcome.result;
}

/** Ferme (avec motif) ou rouvre une distribution. */
export async function setDistributionOpenAction(
  amap: string,
  input: { distributionId: string; open: boolean; reason?: string },
): Promise<SetOpenResult | Forbidden> {
  const outcome = await runAmapAction(amap, planningPath(amap), (tx, ctx) =>
    setDistributionOpen(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(planningPath(amap));
  return outcome.result;
}
