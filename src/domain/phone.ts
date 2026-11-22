/**
 * Numéros de téléphone : toujours enregistrés au format international (+33612345678), le seul
 * que comprennent les liens « Écrire sur Signal » (signal.me/#p/+33…) et « Appeler » (tel:).
 *
 * On accepte la saisie habituelle en France (« 06 12 34 56 78 », « 06.12.34.56.78 »,
 * « 0033 6… ») et on la convertit. Les numéros étrangers se saisissent avec leur indicatif (+…).
 */

/** Format international E.164 : « + », indicatif sans zéro initial, 7 à 15 chiffres en tout. */
const INTERNATIONAL = /^\+[1-9][0-9]{6,14}$/;

export type PhoneResult = { ok: true; phone: string } | { ok: false };

/**
 * Convertit un numéro saisi au format international.
 *
 * @example normalizePhone("06 12 34 56 78") // { ok: true, phone: "+33612345678" }
 * @example normalizePhone("+32 470 12 34 56") // { ok: true, phone: "+32470123456" }
 * @example normalizePhone("12") // { ok: false }
 */
export function normalizePhone(input: string): PhoneResult {
  // Espaces (y compris insécables), points, tirets, barres obliques et parenthèses : ignorés.
  let phone = input.replace(/[\s.\-/()]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  // Numéro français à 10 chiffres commençant par 0 : on remplace le 0 par +33.
  else if (/^0[1-9][0-9]{8}$/.test(phone)) phone = `+33${phone.slice(1)}`;
  // « +33 (0)6 … » : le 0 entre parenthèses ne se compose pas depuis l'étranger.
  phone = phone.replace(/^\+330/, "+33");
  return INTERNATIONAL.test(phone) ? { ok: true, phone } : { ok: false };
}

/**
 * Affichage lisible d'un numéro enregistré : français en paires (« 06 12 34 56 78 »), les
 * autres tels quels.
 *
 * @example formatPhone("+33612345678") // "06 12 34 56 78"
 */
export function formatPhone(phone: string): string {
  const french = /^\+33([1-9])([0-9]{8})$/.exec(phone);
  if (!french) return phone;
  const digits = `0${french[1]}${french[2]}`;
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/**
 * Liens « Appeler » et « Écrire sur Signal » d'un numéro (story H4), seulement s'il est au format
 * international (« +33612345678 ») : un numéro mal saisi ne donne aucun lien, plutôt qu'un lien
 * qui appellerait le mauvais numéro. Le lien Signal ouvre la conversation dans l'application.
 *
 * @example contactLinks("+33612345678") // { tel: "tel:+33612345678", signal: "https://signal.me/#p/+33612345678" }
 */
export function contactLinks(phone: string | null): { tel: string; signal: string } | null {
  if (!phone || !/^\+[1-9][0-9]{6,14}$/.test(phone)) return null;
  return { tel: `tel:${phone}`, signal: `https://signal.me/#p/${phone}` };
}
