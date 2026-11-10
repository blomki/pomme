import { createHmac } from "node:crypto";

/**
 * Code à 6 chiffres d'une application d'authentification (TOTP, RFC 6238), calculé comme le
 * ferait le téléphone : HMAC-SHA1 du numéro de la période de 30 secondes.
 * `key` : clé brute (Better Auth utilise les octets UTF-8 de son secret).
 */
export function totpCode(key: Buffer, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

/** Décode une clé Base32 (celle affichée sous le QR code). */
export function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error(`Caractère Base32 inattendu : ${char}`);
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** Code actuel pour une clé Base32. */
export const totpFromBase32 = (key: string, now?: number) => totpCode(base32Decode(key), now);
