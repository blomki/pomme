"use server";

import { runAmapAction } from "./amap-action";
import { getFileStore } from "./files/storage";
import {
  deleteStoredImage,
  removeProducerPhoto,
  saveProducerPhoto,
  type SavePhotoResult,
} from "./producer-photos";

// Actions de la photo du producteur (fiche S11). Le fichier arrive dans un FormData (envoi d'un
// formulaire) ; la taille maximale d'une requête est réglée dans next.config.ts.

type Forbidden = { status: "forbidden" };
type SavedPhoto = { status: "saved"; photoUrl: string; photoAlt: string };
export type PhotoActionResult =
  SavedPhoto | Exclude<SavePhotoResult, { status: "saved" }> | Forbidden;

/** Page où revenir après une deuxième vérification (admin) : la fiche du producteur. */
const adminPath = (amap: string, amapProducerId: string) =>
  `/${amap}/admin/producteurs/${encodeURIComponent(amapProducerId)}`;

/** Envoie une nouvelle photo (champ « photo ») et son texte alternatif (« alt »). */
export async function saveProducerPhotoAction(
  amap: string,
  form: FormData,
): Promise<PhotoActionResult> {
  const amapProducerId = String(form.get("amapProducerId") ?? "");
  const file = form.get("photo");
  const store = getFileStore();
  const outcome = await runAmapAction(amap, adminPath(amap, amapProducerId), (tx, ctx) =>
    saveProducerPhoto(
      tx,
      ctx,
      {
        amapProducerId,
        alt: String(form.get("alt") ?? ""),
        file: file instanceof Blob ? file : null,
      },
      store,
    ),
  );
  if ("status" in outcome) return outcome;
  const result = outcome.result;
  if (result.status !== "saved") return result;
  // Transaction validée : l'ancienne image peut quitter le stockage.
  if (result.previousUrl !== result.photoUrl) await deleteStoredImage(store, result.previousUrl);
  return { status: "saved", photoUrl: result.photoUrl, photoAlt: result.photoAlt };
}

/** Retire la photo du producteur. */
export async function removeProducerPhotoAction(
  amap: string,
  amapProducerId: string,
): Promise<{ status: "removed" } | Forbidden> {
  const outcome = await runAmapAction(amap, adminPath(amap, amapProducerId), (tx, ctx) =>
    removeProducerPhoto(tx, ctx, { amapProducerId }),
  );
  if ("status" in outcome) return outcome;
  await deleteStoredImage(getFileStore(), outcome.result.previousUrl);
  return { status: "removed" };
}
