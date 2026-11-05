import { randomBytes as cryptoRandomBytes } from "node:crypto";

/**
 * Génère un identifiant UUID version 7.
 *
 * Pourquoi la version 7 : ses 48 premiers bits sont l'heure de création en millisecondes.
 * Les identifiants se trient donc par date, ce qui garde les index de la base compacts,
 * tout en restant impossibles à deviner (74 bits aléatoires), contrairement à 1, 2, 3…
 * PostgreSQL 17 ne sait pas encore les produire (ce sera le cas en version 18) : on les crée
 * côté application.
 *
 * @param options.now heure de création, en millisecondes (par défaut : maintenant)
 * @param options.randomBytes source d'aléa (le jeu de données fictif en fournit une
 *   reproductible, pour obtenir les mêmes identifiants à chaque chargement)
 */
export function uuidv7(
  options: { now?: number; randomBytes?: (size: number) => Uint8Array } = {},
): string {
  const now = options.now ?? Date.now();
  const bytes = Buffer.from((options.randomBytes ?? cryptoRandomBytes)(16));
  bytes.writeUIntBE(now, 0, 6); // octets 0 à 5 : horodatage
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6); // version 7
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8); // variante RFC 9562
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** Relit l'heure de création (en millisecondes) contenue dans un UUID v7. */
export function uuidv7Timestamp(id: string): number {
  return Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16);
}
