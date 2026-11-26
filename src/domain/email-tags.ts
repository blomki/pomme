/**
 * Balises des emails groupés (story H1) : `{{prenom}}`, `{{debutPeriodeCommande}}`… remplacées
 * pour chaque destinataire. Fonctions pures, utilisées par l'aperçu (navigateur) et par l'envoi
 * (serveur), pour que l'aperçu montre exactement ce qui partira.
 */
import type { EmailAudience } from "./email-campaigns";

export const EMAIL_TAGS = [
  "prenom",
  "nom",
  "debutPeriodeCommande",
  "finPeriodeCommande",
  "debutDeclarationDisponibilites",
  "finDeclarationDisponibilites",
  "producteur",
] as const;
export type EmailTag = (typeof EMAIL_TAGS)[number];

/** Modèles proposés (textes dans fr.json, Admin.emails.templates) ; ils ne se modifient pas. */
export const EMAIL_TEMPLATES = [
  "free",
  "order_opening",
  "duty_opening",
  "duty_reminder",
  "producer_info",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

const TAG = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** Balises écrites dans un texte, sans doublon, dans l'ordre d'apparition. */
export function findTags(text: string): string[] {
  return [...new Set([...text.matchAll(TAG)].map((m) => m[1]!))];
}

const isKnown = (tag: string): tag is EmailTag => (EMAIL_TAGS as readonly string[]).includes(tag);

export type TagValues = Partial<Record<EmailTag, string>>;

export type TagCheck = {
  /** Balises inconnues : laissées telles quelles, avec un avertissement. */
  unknown: string[];
  /** `{{producteur}}` utilisée hors d'un envoi aux clients d'un producteur. */
  producerOutside: boolean;
  /** Périodes nécessaires mais pas encore définies : l'envoi est bloqué. */
  missing: Array<"orderPeriod" | "dutyPeriod">;
};

/** Contrôle l'objet et le message avant l'aperçu et l'envoi. */
export function checkTags(params: {
  subject: string;
  body: string;
  audience: EmailAudience;
  values: TagValues;
}): TagCheck {
  const tags = findTags(`${params.subject}\n${params.body}`);
  const missing = new Set<"orderPeriod" | "dutyPeriod">();
  for (const tag of tags) {
    if (/PeriodeCommande$/.test(tag) && isKnown(tag) && !params.values[tag]) {
      missing.add("orderPeriod");
    }
    if (/DeclarationDisponibilites$/.test(tag) && isKnown(tag) && !params.values[tag]) {
      missing.add("dutyPeriod");
    }
  }
  return {
    unknown: tags.filter((tag) => !isKnown(tag)),
    producerOutside: tags.includes("producteur") && params.audience !== "producer_customers",
    missing: [...missing],
  };
}

/** Le message peut-il partir ? Objet obligatoire ; aucune période manquante ni balise producteur hors sujet. */
export function canSend(subject: string, check: TagCheck): boolean {
  return subject.trim() !== "" && check.missing.length === 0 && !check.producerOutside;
}

/** Remplace les balises connues par leur valeur ; une balise inconnue ou sans valeur reste. */
export function renderTags(text: string, values: TagValues): string {
  return text.replace(TAG, (whole, name: string) =>
    isKnown(name) && values[name] !== undefined ? values[name]! : whole,
  );
}

/** Insère une balise à la position du curseur ; renvoie le texte et la nouvelle position. */
export function insertTag(
  text: string,
  cursor: number,
  tag: EmailTag,
): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, text.length));
  const inserted = `{{${tag}}}`;
  return { text: text.slice(0, at) + inserted + text.slice(at), cursor: at + inserted.length };
}

/** Paragraphes du message : séparés par une ligne vide ; retours à la ligne simples gardés. */
export function bodyParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}
