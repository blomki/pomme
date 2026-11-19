// Réglages du stockage des fichiers (fiche S11, ADR 0022), dans un module léger, sans le client
// S3 : le proxy (src/proxy.ts) en a besoin pour la Content-Security-Policy de chaque page.

/** Réglages lus dans l'environnement ; null si le stockage n'est pas configuré. */
export type StorageSettings = {
  /** Adresse du service : http://localhost:9000 (MinIO), https://cellar-c2.services.clever-cloud.com. */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/**
 * Réglages du stockage. Les variables CELLAR_ADDON_* sont posées par Clever Cloud quand
 * l'add-on Cellar est lié à l'application ; FILES_S3_* les remplacent (en local, MinIO). Sans
 * FILES_BUCKET, l'envoi de fichiers est désactivé (écran : « pas encore disponible »).
 */
export function storageSettings(
  env: Record<string, string | undefined> = process.env,
): StorageSettings | null {
  const host = env.CELLAR_ADDON_HOST;
  const endpoint = env.FILES_S3_ENDPOINT ?? (host ? `https://${host}` : undefined);
  const accessKeyId = env.FILES_S3_ACCESS_KEY ?? env.CELLAR_ADDON_KEY_ID;
  const secretAccessKey = env.FILES_S3_SECRET_KEY ?? env.CELLAR_ADDON_KEY_SECRET;
  const bucket = env.FILES_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint: endpoint.replace(/\/+$/, ""), accessKeyId, secretAccessKey, bucket };
}

/**
 * Origine des images, à autoriser dans la Content-Security-Policy (img-src), ou null sans
 * stockage. Adresses « par chemin » (service/bucket/clé) : une seule origine, en local comme
 * chez Clever Cloud.
 */
export function storageOrigin(settings: StorageSettings | null): string | null {
  if (!settings) return null;
  try {
    return new URL(settings.endpoint).origin;
  } catch {
    return null;
  }
}
