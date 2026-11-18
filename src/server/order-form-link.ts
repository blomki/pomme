import { createHmac, timingSafeEqual } from "node:crypto";

// Lien signé vers la version imprimable d'un bon de commande (story E1, ADR 0019), envoyé au
// producteur par email. Un producteur n'a pas toujours de compte Pomme : la signature remplace
// la connexion, pour CE bon de commande seulement, en lecture, et pour un temps limité.
//
// Clé : dérivée du secret de l'application (BETTER_AUTH_SECRET), avec un libellé propre à cet
// usage. Changer le secret invalide tous les liens déjà envoyés.

/** Durée de validité d'un lien : de quoi préparer le mois, et le suivant. */
export const ORDER_FORM_LINK_DAYS = 60;

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("pomme:order-form-link:v1").digest();
}

function signature(secret: string, amapProducerId: string, month: string, expires: number) {
  return createHmac("sha256", key(secret))
    .update(`${amapProducerId}|${month}|${expires}`)
    .digest("base64url");
}

/** Clé à mettre dans le lien (`?cle=…`) : date d'expiration et signature. */
export function signOrderFormLink(
  params: { amapProducerId: string; month: string; now?: Date },
  secret = process.env.BETTER_AUTH_SECRET ?? "",
): string {
  if (!secret) throw new Error("BETTER_AUTH_SECRET manquant : lien impossible à signer.");
  const now = params.now ?? new Date();
  const expires = Math.floor(now.getTime() / 1000) + ORDER_FORM_LINK_DAYS * 86_400;
  return `${expires}.${signature(secret, params.amapProducerId, params.month, expires)}`;
}

/** Date d'expiration d'une clé, ou null si elle est mal formée. */
export function linkExpiry(token: string): Date | null {
  const match = /^(\d{1,12})\.[\w-]{43}$/.exec(token);
  return match ? new Date(Number(match[1]) * 1000) : null;
}

/**
 * La clé est-elle valable pour ce bon de commande, à cet instant ? Comparaison à temps
 * constant : on ne laisse pas deviner la signature caractère par caractère.
 */
export function verifyOrderFormLink(
  token: string,
  params: { amapProducerId: string; month: string; now?: Date },
  secret = process.env.BETTER_AUTH_SECRET ?? "",
): boolean {
  if (!secret) return false;
  const match = /^(\d{1,12})\.([\w-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires * 1000 <= (params.now ?? new Date()).getTime()) return false;
  const expected = Buffer.from(signature(secret, params.amapProducerId, params.month, expires));
  const given = Buffer.from(match[2]!);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
