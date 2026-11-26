"use server";

import { revalidatePath } from "next/cache";

import {
  removeAmapLogo,
  removeBannerImage,
  saveAmapLogo,
  saveBannerImage,
  type SaveBannerImageResult,
  saveAmapSettings,
  type SaveLogoResult,
  type SaveSettingsResult,
} from "./amap-settings";
import { runAmapAction } from "./amap-action";
import { getFileStore } from "./files/storage";
import { deleteStoredImage } from "./producer-photos";

// Actions des réglages de l'AMAP (story A4). Chacune : contexte de l'AMAP de l'adresse, puis
// amap-settings.ts, qui vérifie le rôle admin. Le thème change toute l'AMAP : on relit tout.

type Forbidden = { status: "forbidden" };
const settingsPath = (amap: string) => `/${amap}/admin/reglages`;

/** Enregistre le nom, le thème, l'email de contact et les paramètres. */
export async function saveAmapSettingsAction(
  amap: string,
  input: Record<string, unknown>,
): Promise<SaveSettingsResult | Forbidden> {
  const outcome = await runAmapAction(amap, settingsPath(amap), (tx, ctx) =>
    saveAmapSettings(tx, ctx, input),
  );
  if ("status" in outcome) return outcome;
  if (outcome.result.status === "saved") revalidatePath(`/${amap}`, "layout");
  return outcome.result;
}

/** Réponse au format de l'envoi d'image (ImageUpload) : l'adresse et le texte alternatif. */
export type LogoActionResult =
  | { status: "saved"; photoUrl: string; photoAlt: string }
  | Exclude<SaveLogoResult, { status: "saved" }>
  | Forbidden;

/** Envoie un nouveau logo (champ « photo » du formulaire d'image). */
export async function saveAmapLogoAction(amap: string, form: FormData): Promise<LogoActionResult> {
  const file = form.get("photo");
  const store = getFileStore();
  const outcome = await runAmapAction(amap, settingsPath(amap), (tx, ctx) =>
    saveAmapLogo(tx, ctx, { file: file instanceof Blob ? file : null }, store),
  );
  if ("status" in outcome) return outcome;
  const result = outcome.result;
  if (result.status !== "saved") return result;
  // Transaction validée : l'ancien logo peut quitter le stockage.
  await deleteStoredImage(store, result.previousUrl);
  revalidatePath(`/${amap}`, "layout");
  return { status: "saved", photoUrl: result.logoUrl, photoAlt: "" };
}

/** Retire le logo. */
export async function removeAmapLogoAction(
  amap: string,
): Promise<{ status: "removed" } | Forbidden> {
  const outcome = await runAmapAction(amap, settingsPath(amap), (tx, ctx) =>
    removeAmapLogo(tx, ctx),
  );
  if ("status" in outcome) return outcome;
  await deleteStoredImage(getFileStore(), outcome.result.previousUrl);
  revalidatePath(`/${amap}`, "layout");
  return { status: "removed" };
}

export type BannerImageActionResult =
  | { status: "saved"; photoUrl: string; photoAlt: string }
  | { status: Exclude<SaveBannerImageResult["status"], "saved" | "invalid"> }
  | Forbidden;

/** Envoie l'image du bandeau d'une famille d'écrans (story S14, champ « photo »). */
export async function saveBannerImageAction(
  amap: string,
  group: string,
  form: FormData,
): Promise<BannerImageActionResult> {
  const file = form.get("photo");
  const store = getFileStore();
  const outcome = await runAmapAction(amap, settingsPath(amap), (tx, ctx) =>
    saveBannerImage(tx, ctx, { group, file: file instanceof Blob ? file : null }, store),
  );
  if ("status" in outcome) return outcome;
  const result = outcome.result;
  // Famille inconnue : l'écran ne propose que des familles valables.
  if (result.status === "invalid") return { status: "forbidden" };
  if (result.status !== "saved") return { status: result.status };
  // Transaction validée : l'ancienne image peut quitter le stockage.
  await deleteStoredImage(store, result.previousUrl);
  revalidatePath(`/${amap}`, "layout");
  return { status: "saved", photoUrl: result.url, photoAlt: "" };
}

/** Retire l'image du bandeau d'une famille : le bandeau reprend le logo. */
export async function removeBannerImageAction(
  amap: string,
  group: string,
): Promise<{ status: "removed" } | Forbidden> {
  const outcome = await runAmapAction(amap, settingsPath(amap), (tx, ctx) =>
    removeBannerImage(tx, ctx, { group }),
  );
  if ("status" in outcome) return outcome;
  // Famille inconnue : rien n'a changé ; l'écran ne propose que des familles valables.
  if (outcome.result.status !== "removed") return { status: "forbidden" };
  await deleteStoredImage(getFileStore(), outcome.result.previousUrl);
  revalidatePath(`/${amap}`, "layout");
  return { status: "removed" };
}
