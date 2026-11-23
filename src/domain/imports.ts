/**
 * Reprise des données depuis AmapJ (story K1, ADR 0044) : colonnes reconnues, contrôle de chaque
 * ligne, regroupement des personnes en foyers. Fonctions pures ; l'écriture en base est dans
 * server/imports.ts.
 *
 * Les colonnes se reconnaissent par leur nom, sans tenir compte des majuscules, des accents ni
 * de la ponctuation : « E-mail », « email » et « Adresse email » désignent la même colonne. Le
 * modèle Pomme donne un nom par colonne ; les synonymes couvrent les exports AmapJ et les
 * habitudes des tableurs.
 */
import { normalizeHouseholdName } from "./households";
import { parseDay } from "./order-periods";
import { normalizePhone } from "./phone";

export const IMPORT_KINDS = ["households", "producers", "products"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

type ColumnSpec = {
  key: string;
  /** En-tête du modèle Pomme. */
  label: string;
  /** Autres noms acceptés (exports AmapJ, tableurs). */
  aliases: string[];
  required?: boolean;
};

export const IMPORT_COLUMNS: Record<ImportKind, ColumnSpec[]> = {
  households: [
    { key: "household", label: "Foyer", aliases: ["nom du foyer", "famille"] },
    { key: "firstName", label: "Prénom", aliases: [], required: true },
    { key: "lastName", label: "Nom", aliases: ["nom de famille"] },
    {
      key: "email",
      label: "Email",
      aliases: ["e-mail", "mail", "courriel", "adresse email", "adresse e-mail", "adresse mail"],
      required: true,
    },
    {
      key: "phone",
      label: "Téléphone",
      aliases: ["tel", "tél", "tel1", "téléphone 1", "portable", "mobile", "numéro de téléphone"],
    },
    { key: "primary", label: "Contact principal", aliases: ["principal"] },
    {
      key: "membershipStart",
      label: "Début adhésion",
      aliases: ["date de début", "date début", "début", "début de l'adhésion"],
    },
    {
      key: "membershipEnd",
      label: "Fin adhésion",
      aliases: ["date de fin", "date fin", "fin", "fin de l'adhésion"],
    },
    {
      key: "dutyCount",
      label: "Permanences faites",
      aliases: ["permanences", "nombre de permanences", "nb permanences"],
    },
  ],
  producers: [
    {
      key: "name",
      label: "Producteur",
      aliases: ["nom", "nom du producteur", "raison sociale"],
      required: true,
    },
    { key: "category", label: "Catégorie", aliases: ["type", "type de production"] },
    {
      key: "email",
      label: "Email",
      aliases: ["e-mail", "mail", "courriel", "adresse email", "adresse e-mail"],
    },
    { key: "phone", label: "Téléphone", aliases: ["tel", "tél", "tel1", "portable", "mobile"] },
    {
      key: "checkPayee",
      label: "Ordre des chèques",
      aliases: ["chèque à l'ordre de", "ordre", "libellé chèque"],
    },
    { key: "description", label: "Présentation", aliases: ["description"] },
  ],
  products: [
    { key: "producer", label: "Producteur", aliases: ["nom du producteur"], required: true },
    {
      key: "name",
      label: "Produit",
      aliases: ["nom", "nom du produit", "libellé", "désignation"],
      required: true,
    },
  ],
};

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
