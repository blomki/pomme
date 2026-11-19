import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapProducer, producer, referentAssignment } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import {
  checkUpload,
  cleanAltText,
  IMAGE_USAGES,
  MAX_UPLOAD_BYTES,
  type UploadProblem,
} from "@/domain/images";
import { referentOrAdminAccess } from "@/domain/roles";

import { ForbiddenError, SecondFactorRequiredError } from "./auth/errors";
import { requireRole } from "./auth/require-role";
import { reencodeImage } from "./files/images";
import type { FileStore } from "./files/storage";

// Photo du producteur (fiche S11, ADR 0022), sur sa fiche commune à toutes ses AMAP. La changent
// le référent qui suit ce producteur et les admins de l'AMAP (deuxième vérification exigée d'un
// admin qui n'est pas son référent). Le fichier est contrôlé, ré-encodé, puis stocké hors du
// serveur web ; la base ne garde que son adresse publique et son texte alternatif.

/** Le compte peut changer la photo de ce producteur. Renvoie le producteur. */
export async function requireProducerManager(
  tx: Transaction,
  ctx: AmapContext,
  amapProducerId: string,
): Promise<{ producerId: string; photoUrl: string | null }> {
  const roles = await requireRole(tx, ctx, ["referent", "admin"]);
  if (!z.uuid().safeParse(amapProducerId).success) throw new ForbiddenError();
  const [target] = await tx
    .select({ producerId: amapProducer.producerId, photoUrl: producer.photoUrl })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(eq(amapProducer.id, amapProducerId));
  if (!target) throw new ForbiddenError();
  const [follows] = await tx
    .select({ id: referentAssignment.id })
    .from(referentAssignment)
    .where(
      and(
        eq(referentAssignment.amapProducerId, amapProducerId),
        eq(referentAssignment.userId, ctx.userId!),
      ),
    );
  const access = referentOrAdminAccess({
    roles,
    followsProducer: Boolean(follows),
    secondFactorVerified: Boolean(ctx.secondFactorVerified),
  });
  if (access === "second_factor") throw new SecondFactorRequiredError();
  if (access === "forbidden") throw new ForbiddenError();
  return target;
}

export type SavePhotoResult =
  | {
      status: "saved";
      photoUrl: string;
      photoAlt: string;
      /** Ancienne image, à supprimer du stockage une fois la transaction validée. */
      previousUrl: string | null;
    }
  | { status: UploadProblem } // vide, trop lourd, pas une image
  | { status: "no_file" } // ni nouveau fichier, ni photo à garder
  | { status: "invalid_alt" } // texte alternatif trop long
  | { status: "unavailable" }; // stockage pas configuré

/**
 * Enregistre la photo du producteur, ou seulement son texte alternatif (sans nouveau fichier).
 * En cas d'échec après l'envoi au stockage, le nouveau fichier est supprimé : pas d'orphelin.
 */
export async function saveProducerPhoto(
  tx: Transaction,
  ctx: AmapContext,
  input: { amapProducerId: string; alt: string; file: Blob | null },
  store: FileStore | null,
): Promise<SavePhotoResult> {
  const target = await requireProducerManager(tx, ctx, input.amapProducerId);
  if (!store) return { status: "unavailable" };
  const alt = cleanAltText(input.alt);
  if (alt === null) return { status: "invalid_alt" };

  if (!input.file || input.file.size === 0) {
    // Seulement le texte alternatif d'une photo déjà là.
    if (!target.photoUrl) return { status: "no_file" };
    await tx.update(producer).set({ photoAlt: alt }).where(eq(producer.id, target.producerId));
    return { status: "saved", photoUrl: target.photoUrl, photoAlt: alt, previousUrl: null };
  }

  // Taille vérifiée avant de lire le fichier en mémoire.
  if (input.file.size > MAX_UPLOAD_BYTES) return { status: "too_large" };
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const problem = checkUpload({ size: bytes.length, head: bytes.subarray(0, 16) });
  if (problem) return { status: problem };
  let image;
  try {
    image = await reencodeImage(bytes, "producer_photo");
  } catch {
    // Fichier abîmé, piégé ou démesuré : refusé comme « pas une image ».
    return { status: "not_image" };
  }

  const key = `${IMAGE_USAGES.producer_photo.folder}/${uuidv7()}.webp`;
  await store.put(key, image.body, image.contentType);
  const photoUrl = store.publicUrl(key);
  try {
    await tx
      .update(producer)
      .set({ photoUrl, photoAlt: alt })
      .where(eq(producer.id, target.producerId));
  } catch (error) {
    await store.delete(key).catch(() => undefined);
    throw error;
  }
  return { status: "saved", photoUrl, photoAlt: alt, previousUrl: target.photoUrl };
}

/** Retire la photo du producteur. L'image est supprimée du stockage après la transaction. */
export async function removeProducerPhoto(
  tx: Transaction,
  ctx: AmapContext,
  input: { amapProducerId: string },
): Promise<{ status: "removed"; previousUrl: string | null }> {
  const target = await requireProducerManager(tx, ctx, input.amapProducerId);
  await tx
    .update(producer)
    .set({ photoUrl: null, photoAlt: "" })
    .where(eq(producer.id, target.producerId));
  return { status: "removed", previousUrl: target.photoUrl };
}

/**
 * Supprime du stockage une image remplacée ou retirée. Sans gravité si cela échoue : un fichier
 * orphelin ne montre rien de plus que ce qui était déjà public.
 */
export async function deleteStoredImage(store: FileStore | null, url: string | null) {
  const key = url && store?.keyFromUrl(url);
  if (key) await store!.delete(key).catch(() => undefined);
}
