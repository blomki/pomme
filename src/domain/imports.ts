/**
 * Reprise des données depuis AmapJ (story K1, ADR 0044) : colonnes reconnues, contrôle de chaque
 * ligne, regroupement des personnes en foyers. Fonctions pures ; l'écriture en base est dans
 * server/imports.ts.
 *
 * Les colonnes se reconnaissent par leur nom, sans tenir compte des majuscules, des accents ni
 * de la ponctuation : « E-mail », « email » et « Adresse email » désignent la même colonne. Le
 * modèle Pomme donne un nom par colonne ; les synonymes (exports AmapJ, habitudes des
 * tableurs) sont dans le fichier de correspondance import-mapping.json, modifiable sans toucher
 * au code (mode d'emploi : docs/import-amapj.md).
 */
import { normalizeHouseholdName } from "./households";
import mappingFile from "./import-mapping.json";
import { parseDay } from "./order-periods";
import { normalizePhone } from "./phone";

export const IMPORT_KINDS = ["households", "producers", "products"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

type ColumnSpec = {
  key: string;
  /** En-tête du modèle Pomme ; c'est aussi le nom de la colonne dans import-mapping.json. */
  label: string;
  /** Autres noms acceptés (exports AmapJ, tableurs), lus dans import-mapping.json. */
  aliases: string[];
  required?: boolean;
};

/** Section du fichier de correspondance pour chaque type d'import. */
export const MAPPING_SECTIONS: Record<ImportKind, string> = {
  households: "adherents",
  producers: "producteurs",
  products: "produits",
};

/** Colonnes de Pomme : nom interne, en-tête du modèle, colonne obligatoire. */
const POMME_COLUMNS: Record<ImportKind, Array<Omit<ColumnSpec, "aliases">>> = {
  households: [
    { key: "household", label: "Foyer" },
    { key: "firstName", label: "Prénom", required: true },
    { key: "lastName", label: "Nom" },
    { key: "email", label: "Email", required: true },
    { key: "phone", label: "Téléphone" },
    { key: "primary", label: "Contact principal" },
    { key: "membershipStart", label: "Début adhésion" },
    { key: "membershipEnd", label: "Fin adhésion" },
    { key: "dutyCount", label: "Permanences faites" },
  ],
  producers: [
    { key: "name", label: "Producteur", required: true },
    { key: "category", label: "Catégorie" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Téléphone" },
    { key: "checkPayee", label: "Ordre des chèques" },
    { key: "description", label: "Présentation" },
  ],
  products: [
    { key: "producer", label: "Producteur", required: true },
    { key: "name", label: "Produit", required: true },
  ],
};

export type ImportMapping = Record<string, Record<string, string[]>>;

/**
 * Colonnes reconnues, d'après un fichier de correspondance (par défaut import-mapping.json) :
 * pour chaque colonne de Pomme, la liste des noms de colonne acceptés dans le fichier importé.
 * Une colonne absente du fichier de correspondance n'a pas de synonyme : seul son nom Pomme
 * est reconnu.
 */
export function importColumns(mapping: ImportMapping): Record<ImportKind, ColumnSpec[]> {
  const result = {} as Record<ImportKind, ColumnSpec[]>;
  for (const kind of IMPORT_KINDS) {
    const section = mapping[MAPPING_SECTIONS[kind]] ?? {};
    result[kind] = POMME_COLUMNS[kind].map((c) => ({ ...c, aliases: section[c.label] ?? [] }));
  }
  return result;
}

export const IMPORT_COLUMNS = importColumns(mappingFile as unknown as ImportMapping);

export type MappingProblem =
  | { code: "missing_section"; section: string }
  | { code: "unknown_column"; section: string; column: string }
  | { code: "not_a_list"; section: string; column: string }
  | { code: "duplicate"; section: string; name: string };

/**
 * Vérifie un fichier de correspondance : sections attendues, colonnes Pomme connues, listes de
 * noms, et aucun nom utilisé pour deux colonnes d'une même section (le fichier importé serait
 * ambigu). Lancé par les tests à chaque modification du fichier.
 */
export function checkMapping(mapping: Record<string, unknown>): MappingProblem[] {
  const problems: MappingProblem[] = [];
  for (const kind of IMPORT_KINDS) {
    const section = MAPPING_SECTIONS[kind];
    const content = mapping[section];
    if (!content || typeof content !== "object") {
      problems.push({ code: "missing_section", section });
      continue;
    }
    const labels = POMME_COLUMNS[kind].map((c) => c.label);
    const seen = new Map<string, string>();
    for (const label of labels) seen.set(headerKey(label), label);
    for (const [column, names] of Object.entries(content as Record<string, unknown>)) {
      if (!labels.includes(column)) {
        problems.push({ code: "unknown_column", section, column });
        continue;
      }
      if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
        problems.push({ code: "not_a_list", section, column });
        continue;
      }
      for (const name of names as string[]) {
        const owner = seen.get(headerKey(name));
        if (owner !== undefined && owner !== column) {
          problems.push({ code: "duplicate", section, name });
        }
        seen.set(headerKey(name), column);
      }
    }
  }
  return problems;
}

/** Nom de colonne comparable : minuscules, sans accents ni ponctuation, espaces simples. */
export function headerKey(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type HeaderMapping = {
  /** Index de chaque colonne reconnue. */
  columns: Record<string, number>;
  /** Colonnes obligatoires absentes (en-têtes du modèle). */
  missing: string[];
  /** En-têtes du fichier non reconnus : ignorés. */
  ignored: string[];
};

/** Fait correspondre les en-têtes du fichier aux colonnes attendues. */
export function mapHeaders(kind: ImportKind, headers: readonly string[]): HeaderMapping {
  const columns: Record<string, number> = {};
  const ignored: string[] = [];
  headers.forEach((header, index) => {
    const key = headerKey(header);
    const spec = IMPORT_COLUMNS[kind].find(
      (c) => headerKey(c.label) === key || c.aliases.some((a) => headerKey(a) === key),
    );
    if (spec && columns[spec.key] === undefined) columns[spec.key] = index;
    else if (header.trim() !== "") ignored.push(header);
  });
  const missing = IMPORT_COLUMNS[kind]
    .filter((c) => c.required && columns[c.key] === undefined)
    .map((c) => c.label);
  return { columns, missing, ignored };
}

/** Problème d'une ligne, traduit à l'écran. */
export type RowProblem =
  | { code: "required"; column: string }
  | { code: "email" | "phone" | "date" | "dates_order" | "count" | "yes_no"; value: string }
  | { code: "duplicate_in_file" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Date d'un tableur : « 01/09/2026 », « 1/9/2026 », « 2026-09-01 », parfois suivie d'une heure
 * (« 01/09/2026 00:00 »). Renvoie « AAAA-MM-JJ » ou null.
 */
export function parseSheetDate(input: string): string | null {
  const value = input.trim().split(/\s+/)[0] ?? "";
  const french = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (french) {
    const [, d, m, y] = french;
    return parseDay(`${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`);
  }
  return parseDay(value);
}

/** « oui », « o », « x », « 1 », « vrai » : vrai ; vide ou « non » : faux ; sinon null. */
export function parseYesNo(input: string): boolean | null {
  const value = headerKey(input);
  if (["oui", "o", "x", "1", "vrai", "true", "yes"].includes(value)) return true;
  if (["", "non", "n", "0", "faux", "false", "no"].includes(value)) return false;
  return null;
}

export type HouseholdRow = {
  household: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  primary: boolean;
  membership: { startDate: string; endDate: string } | null;
  dutyCount: number | null;
};
export type ProducerRow = {
  name: string;
  category: string;
  email: string | null;
  phone: string | null;
  checkPayee: string;
  description: string;
};
export type ProductRow = { producer: string; name: string };

export type RowResult<T> = { line: number; value: T } | { line: number; problems: RowProblem[] };

const cell = (values: readonly string[], mapping: HeaderMapping, key: string) => {
  const index = mapping.columns[key];
  return index === undefined ? "" : (values[index] ?? "").trim();
};

/** Contrôle une ligne de foyer. `line` : numéro de ligne dans le fichier (en-tête = 1). */
export function parseHouseholdRow(
  values: readonly string[],
  mapping: HeaderMapping,
  line: number,
): RowResult<HouseholdRow> {
  const get = (key: string) => cell(values, mapping, key);
  const problems: RowProblem[] = [];
  const firstName = get("firstName");
  const lastName = get("lastName");
  const email = get("email").toLowerCase();
  if (!firstName) problems.push({ code: "required", column: "Prénom" });
  if (!email) problems.push({ code: "required", column: "Email" });
  else if (!EMAIL.test(email)) problems.push({ code: "email", value: email });
  let phone: string | null = null;
  if (get("phone")) {
    const result = normalizePhone(get("phone"));
    if (result.ok) phone = result.phone;
    else problems.push({ code: "phone", value: get("phone") });
  }
  const primary = parseYesNo(get("primary"));
  if (primary === null) problems.push({ code: "yes_no", value: get("primary") });
  let membership: HouseholdRow["membership"] = null;
  const [start, end] = [get("membershipStart"), get("membershipEnd")];
  if (start || end) {
    const [startDate, endDate] = [parseSheetDate(start), parseSheetDate(end)];
    if (!startDate) problems.push({ code: "date", value: start });
    if (!endDate) problems.push({ code: "date", value: end });
    if (startDate && endDate) {
      if (startDate > endDate) problems.push({ code: "dates_order", value: `${start} – ${end}` });
      else membership = { startDate, endDate };
    }
  }
  let dutyCount: number | null = null;
  if (get("dutyCount")) {
    const n = Number(get("dutyCount"));
    if (Number.isInteger(n) && n >= 0 && n <= 1000) dutyCount = n;
    else problems.push({ code: "count", value: get("dutyCount") });
  }
  if (problems.length > 0) return { line, problems };
  const household = normalizeHouseholdName(get("household") || `Foyer ${lastName || firstName}`);
  return {
    line,
    value: {
      household,
      firstName,
      lastName,
      email,
      phone,
      primary: primary ?? false,
      membership,
      dutyCount,
    },
  };
}

/** Contrôle une ligne de producteur. */
export function parseProducerRow(
  values: readonly string[],
  mapping: HeaderMapping,
  line: number,
): RowResult<ProducerRow> {
  const get = (key: string) => cell(values, mapping, key);
  const problems: RowProblem[] = [];
  const name = normalizeHouseholdName(get("name"));
  if (!name) problems.push({ code: "required", column: "Producteur" });
  const email = get("email").toLowerCase() || null;
  if (email && !EMAIL.test(email)) problems.push({ code: "email", value: email });
  let phone: string | null = null;
  if (get("phone")) {
    const result = normalizePhone(get("phone"));
    if (result.ok) phone = result.phone;
    else problems.push({ code: "phone", value: get("phone") });
  }
  if (problems.length > 0) return { line, problems };
  return {
    line,
    value: {
      name,
      category: get("category"),
      email,
      phone,
      checkPayee: get("checkPayee") || name,
      description: get("description"),
    },
  };
}

/** Contrôle une ligne de produit. */
export function parseProductRow(
  values: readonly string[],
  mapping: HeaderMapping,
  line: number,
): RowResult<ProductRow> {
  const producer = normalizeHouseholdName(cell(values, mapping, "producer"));
  const name = normalizeHouseholdName(cell(values, mapping, "name"));
  const problems: RowProblem[] = [];
  if (!producer) problems.push({ code: "required", column: "Producteur" });
  if (!name) problems.push({ code: "required", column: "Produit" });
  return problems.length > 0 ? { line, problems } : { line, value: { producer, name } };
}

/** Clé de comparaison d'un nom (foyer, producteur, produit) : sans casse ni accents. */
export const nameKey = (name: string) => headerKey(name);

/**
 * Lignes en double dans le fichier (même clé) : la première est gardée, les suivantes sont
 * refusées. Évite de créer deux fois la même personne, le même producteur ou le même produit.
 */
export function refuseDuplicates<T>(
  rows: Array<RowResult<T>>,
  keyOf: (value: T) => string,
): Array<RowResult<T>> {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!("value" in row)) return row;
    const key = keyOf(row.value);
    if (seen.has(key)) return { line: row.line, problems: [{ code: "duplicate_in_file" }] };
    seen.add(key);
    return row;
  });
}

/** Modèle Pomme : la ligne d'en-têtes d'un type d'import, séparée par des points-virgules. */
export function templateHeader(kind: ImportKind): string {
  return IMPORT_COLUMNS[kind].map((c) => c.label).join(";");
}
