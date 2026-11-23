"use server";

import { revalidatePath } from "next/cache";

import { runAmapAction } from "./amap-action";
import { runImport, type ImportReport } from "./imports";

// Reprise des données depuis AmapJ (story K1, ADR 0044) : aperçu, puis import.

type Forbidden = { status: "forbidden" };

const importPath = (amap: string) => `/${amap}/admin/reprise`;

/** « Voir l'aperçu » : rien n'est enregistré. */
export async function previewImportAction(
  amap: string,
  input: { kind: string; csv: string },
): Promise<ImportReport | Forbidden> {
  const outcome = await runAmapAction(amap, importPath(amap), (tx, ctx) =>
    runImport(tx, ctx, input, false),
  );
  return "status" in outcome ? outcome : outcome.result;
}

/** « Importer » : les lignes valables sont enregistrées ; les autres restent refusées. */
export async function applyImportAction(
  amap: string,
  input: { kind: string; csv: string },
): Promise<ImportReport | Forbidden> {
  const outcome = await runAmapAction(amap, importPath(amap), (tx, ctx) =>
    runImport(tx, ctx, input, true),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(`/${amap}/admin`, "layout");
  return outcome.result;
}
