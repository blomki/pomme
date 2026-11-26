/**
 * Images déposées par les utilisateurs (fiche S11, ADR 0022) : photo du producteur, photos des
 * produits, logo de l'AMAP. Règles pures : types acceptés, taille, réglages de chaque usage et
 * texte alternatif. Le ré-encodage lui-même est fait par le serveur (server/files/images.ts).
 */

/** Taille maximale d'un fichier envoyé : 8 Mo (une photo de téléphone récent en fait 3 à 6). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Formats acceptés à l'envoi. HEIC (iPhone) n'en fait pas partie : Safari convertit la photo en
 * JPEG quand le champ ne propose que ces formats (attribut accept).
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageFormat = "jpeg" | "png" | "webp";

/**
 * Format réel d'un fichier, lu dans ses premiers octets (« nombre magique »). On ne croit ni le
 * nom du fichier ni le type annoncé par le navigateur : un script renommé en « .jpg » est refusé.
 *
 * @example detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) // "jpeg"
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  const starts = (signature: readonly number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // « RIFF » puis 4 octets de taille, puis « WEBP ».
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

export type UploadProblem = "empty" | "too_large" | "not_image";

/**
 * Contrôle d'un fichier envoyé, avant tout traitement : présent, pas trop lourd, et vraiment
 * une image d'un format accepté. null si tout va bien.
 */
export function checkUpload(file: { size: number; head: Uint8Array }): UploadProblem | null {
  if (file.size === 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "too_large";
  return detectImageFormat(file.head) ? null : "not_image";
}

/** Usages d'une image, chacun avec sa taille d'affichage. */
export const IMAGE_USAGES = {
  // Photo de la ferme ou du producteur : en tête de sa fiche, jusqu'à 1 200 points de large.
  producer_photo: { folder: "producteurs", maxWidth: 1200, maxHeight: 1200 },
  // Photo d'un produit : vignette du catalogue, agrandie au besoin.
  product_photo: { folder: "produits", maxWidth: 800, maxHeight: 800 },
  // Logo de l'AMAP : petit, dans l'en-tête et les emails.
  amap_logo: { folder: "logos", maxWidth: 512, maxHeight: 512 },
  // Image d'un bandeau d'en-tête (story S14) : affichée en 96 points, gardée nette sur écran dense.
  banner_image: { folder: "bandeaux", maxWidth: 512, maxHeight: 512 },
  // Image d'une page du site (image principale ou photo dans le texte, story H2).
  page_image: { folder: "pages", maxWidth: 1600, maxHeight: 1600 },
} as const;

export type ImageUsage = keyof typeof IMAGE_USAGES;

/**
 * Nombre maximal de points d'une image à l'entrée (largeur × hauteur) : 50 millions, assez pour
 * un appareil photo récent. Au-delà, le décodage pourrait saturer la mémoire du serveur (une
 * « bombe » de quelques Ko qui se déplie en image géante).
 */
export const MAX_INPUT_PIXELS = 50_000_000;

/** Longueur maximale du texte alternatif : une phrase courte suffit. */
export const MAX_ALT_LENGTH = 150;

/**
 * Texte alternatif nettoyé (espaces en trop retirés), ou null s'il est trop long. Vide : la page
 * en propose un par défaut (« Photo de … »).
 *
 * @example cleanAltText("  Marie   dans son verger ") // "Marie dans son verger"
 */
export function cleanAltText(text: string): string | null {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_ALT_LENGTH ? null : clean;
}
