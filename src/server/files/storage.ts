import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import { storageSettings, type StorageSettings } from "./settings";

/**
 * Stockage des fichiers déposés (fiche S11, ADR 0022) : un stockage objet compatible S3, hors du
 * serveur web. Cellar chez Clever Cloud ; en local, MinIO (docker-compose.yml).
 *
 * Les images sont publiques (photo d'un producteur, logo d'une AMAP) : le navigateur les lit
 * directement dans le stockage, à une adresse imprévisible (un identifiant tiré au hasard).
 * L'application n'a donc pas à servir elle-même chaque image.
 */
export interface FileStore {
  /** Enregistre un fichier sous cette clé (« producteurs/0193….webp »). */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Supprime un fichier ; sans erreur s'il n'existe déjà plus. */
  delete(key: string): Promise<void>;
  /** Adresse publique d'un fichier. */
  publicUrl(key: string): string;
  /** Clé d'un fichier de ce stockage d'après son adresse publique, ou null si elle n'en vient pas. */
  keyFromUrl(url: string): string | null;
}

/** Client S3 pour un stockage compatible (MinIO, Cellar). */
export function s3Client(settings: StorageSettings): S3Client {
  const config: S3ClientConfig = {
    endpoint: settings.endpoint,
    // Région sans effet chez Cellar et MinIO, mais exigée par le client.
    region: "us-east-1",
    // Adresses par chemin (service/bucket/clé) : MinIO n'accepte pas les sous-domaines.
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  };
  return new S3Client(config);
}

/** Stockage S3 (MinIO, Cellar). */
export class S3FileStore implements FileStore {
  private readonly client: S3Client;
  private readonly base: string;

  constructor(private readonly settings: StorageSettings) {
    this.client = s3Client(settings);
    this.base = `${settings.endpoint}/${settings.bucket}/`;
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Une clé n'est jamais réutilisée : le navigateur peut garder l'image un an.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }));
  }

  publicUrl(key: string) {
    return `${this.base}${key}`;
  }

  keyFromUrl(url: string) {
    return url.startsWith(this.base) ? url.slice(this.base.length) : null;
  }
}

let shared: FileStore | null | undefined;

/** Stockage de l'application, ou null s'il n'est pas configuré (envoi désactivé). */
export function getFileStore(): FileStore | null {
  if (shared === undefined) {
    const settings = storageSettings();
    shared = settings ? new S3FileStore(settings) : null;
  }
  return shared;
}
