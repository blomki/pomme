import sharp from "sharp";

import { IMAGE_USAGES, MAX_INPUT_PIXELS, type ImageUsage } from "@/domain/images";

/**
 * Ré-encode une image déposée (fiche S11, ADR 0022), avant de la stocker :
 * - elle est entièrement décodée puis réécrite en WebP : un fichier piégé (contenu caché après
 *   l'image, faux en-têtes) ne passe pas, seuls les points de l'image sont gardés ;
 * - les métadonnées disparaissent (position GPS, appareil, date) : sharp ne les recopie pas ;
 *   l'orientation enregistrée par le téléphone est appliquée avant ;
 * - elle est réduite à la taille de son usage (jamais agrandie).
 *
 * Lève une erreur si le fichier n'est pas une image lisible ou s'il est démesuré.
 */
export async function reencodeImage(
  input: Uint8Array,
  usage: ImageUsage,
): Promise<{ body: Uint8Array; contentType: "image/webp"; width: number; height: number }> {
  const { maxWidth, maxHeight } = IMAGE_USAGES[usage];
  const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // orientation EXIF appliquée, puis oubliée avec les autres métadonnées
    .resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return {
    body: new Uint8Array(data),
    contentType: "image/webp",
    width: info.width,
    height: info.height,
  };
}
