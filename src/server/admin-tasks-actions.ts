"use server";

import { revalidatePath } from "next/cache";

import { markTaskDone, type MarkTaskResult } from "./admin-tasks";
import { runAmapAction } from "./amap-action";

// Actions de la liste de tâches du tableau de bord (story H3) : contexte de l'AMAP de l'adresse,
// puis admin-tasks.ts, qui vérifie le rôle admin.

/** Coche une tâche « À suivre » comme faite, ou la rétablit. */
export async function markTaskDoneAction(
  amap: string,
  input: { taskId: string; done: boolean },
): Promise<MarkTaskResult | { status: "forbidden" }> {
  const path = `/${amap}/admin`;
  const outcome = await runAmapAction(amap, path, (tx, ctx) => markTaskDone(tx, ctx, input));
  if ("status" in outcome) return outcome;
  if (outcome.result.status === "saved") revalidatePath(path);
  return outcome.result;
}
