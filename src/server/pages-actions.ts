"use server";

import { revalidatePath } from "next/cache";

import { runAmapAction } from "./amap-action";
import { getFileStore } from "./files/storage";
import {
  movePageInMenu,
  savePage,
  setPageInMenu,
  uploadPageImage,
  type SavePageResult,
  type UploadPageImageResult,
} from "./pages";

// Actions de l'écran « Pages » (story H2). Chacune : contexte de l'AMAP de l'adresse, puis
// pages.ts, qui vérifie le rôle admin. Le site public est relu après chaque changement.

type Forbidden = { status: "forbidden" };
const listPath = (amap: string) => `/${amap}/admin/pages`;

/** Début d'adresse des images permises dans les pages : celles du stockage de Pomme. */
function imageOrigin(): string | null {
  return getFileStore()?.publicUrl("") ?? null;
}

/** Enregistre, publie ou dépublie une page. */
export async function savePageAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SavePageResult | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    savePage(tx, ctx, input, imageOrigin()),
  );
  if ("status" in outcome) return outcome;
  if (outcome.result.status === "saved") revalidatePath(`/${amap}`, "layout");
  return outcome.result;
}

/** Coche ou décoche « Dans le menu ». */
export async function setPageInMenuAction(
  amap: string,
  input: { pageId: string; inMenu: boolean },
): Promise<{ status: "saved" | "not_found" | "invalid" } | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    setPageInMenu(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(`/${amap}`, "layout");
  return outcome.result;
}

/** Avance ou recule une page dans le menu. */
export async function movePageInMenuAction(
  amap: string,
  input: { pageId: string; delta: -1 | 1 },
): Promise<{ status: "saved" | "not_found" | "invalid" } | Forbidden> {
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    movePageInMenu(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  revalidatePath(`/${amap}`, "layout");
  return outcome.result;
}

/** Envoie une image de page (champ « photo »). */
export async function uploadPageImageAction(
  amap: string,
  form: FormData,
): Promise<UploadPageImageResult | Forbidden> {
  const file = form.get("photo");
  const outcome = await runAmapAction(amap, listPath(amap), (tx, ctx) =>
    uploadPageImage(tx, ctx, { file: file instanceof Blob ? file : null }, getFileStore()),
  );
  return "status" in outcome ? outcome : outcome.result;
}
