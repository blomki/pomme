/**
 * Demandes d'adhésion (story B2, ADR 0034) : un visiteur remplit « Nous rejoindre » sur le site
 * de l'AMAP ; un administrateur écrit ou appelle, marque la demande comme contactée, puis
 * l'accepte (le foyer est créé et invité) ou la refuse.
 */

import { normalizePhone } from "./phone";

export const JOIN_REQUEST_STATUSES = ["new", "contacted", "accepted", "declined"] as const;
export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];

export const JOIN_REQUEST_LIMITS = { name: 80, message: 1000 } as const;

export type JoinRequestProblem = "name" | "email" | "phone" | "message";

/**
 * Contrôle d'une demande : nom (80 caractères au plus), email, téléphone facultatif (au format
 * français ou international), message facultatif (1 000 caractères au plus). Renvoie les
 * champs en erreur et les valeurs nettoyées.
 *
 * @example checkJoinRequest({ name: "Camille", email: "c@example.org", phone: "06 12 34 56 78", message: "" })
 */
export function checkJoinRequest(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
}):
  | { ok: true; value: { name: string; email: string; phone: string | null; message: string } }
  | { ok: false; problems: JoinRequestProblem[] } {
  const problems: JoinRequestProblem[] = [];
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name === "" || name.length > JOIN_REQUEST_LIMITS.name) problems.push("name");
  const email = input.email.trim().toLowerCase();
  // Contrôle simple : une adresse, un @, un domaine avec un point. L'admin écrit ensuite à la
  // personne : une adresse fausse se voit vite.
  if (!looksLikeEmail(email)) problems.push("email");
  let phone: string | null = null;
  if (input.phone.trim() !== "") {
    const normalized = normalizePhone(input.phone);
    if (normalized.ok) phone = normalized.phone;
    else problems.push("phone");
  }
  const message = input.message.trim();
  if (message.length > JOIN_REQUEST_LIMITS.message) problems.push("message");
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: { name, email, phone, message } };
}

/** Ce qu'on peut encore faire d'une demande : une demande acceptée ou refusée est close. */
export function isOpen(status: JoinRequestStatus): boolean {
  return status === "new" || status === "contacted";
}

/**
 * Prénom et nom proposés pour le membre du foyer, d'après le nom saisi : le premier mot est
 * le prénom, la suite le nom (l'admin corrige au besoin).
 *
 * @example splitName("Camille Le Goff") // { firstName: "Camille", lastName: "Le Goff" }
 */
export function splitName(name: string): { firstName: string; lastName: string } {
  const [first = "", ...rest] = name.replace(/\s+/g, " ").trim().split(" ");
  return { firstName: first, lastName: rest.join(" ") };
}

/**
 * Contrôle simple d'une adresse email : une partie avant un seul @, un domaine avec un point
 * (ni au début ni à la fin), pas d'espace, 254 caractères au plus.
 */
export function looksLikeEmail(email: string): boolean {
  if (email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  const dot = domain.lastIndexOf(".");
  return local !== "" && dot > 0 && dot < domain.length - 1;
}
