import { describe, expect, it } from "vitest";

import mappingFile from "./import-mapping.json";
import {
  checkMapping,
  headerKey,
  importColumns,
  mapHeaders,
  parseHouseholdRow,
  parseProducerRow,
  parseProductRow,
  parseSheetDate,
  parseYesNo,
  refuseDuplicates,
  templateHeader,
  type RowResult,
} from "./imports";

describe("mapHeaders", () => {
  it("reconnaît les colonnes sans tenir compte des majuscules, accents ni ponctuation", () => {
    const mapping = mapHeaders("households", ["NOM", "Prenom", "E-mail", "Tél", "Remarques"]);
    expect(mapping.columns).toEqual({ lastName: 0, firstName: 1, email: 2, phone: 3 });
    expect(mapping.missing).toEqual([]);
    expect(mapping.ignored).toEqual(["Remarques"]);
  });

  it("signale les colonnes obligatoires absentes", () => {
    expect(mapHeaders("households", ["Nom"]).missing).toEqual(["Prénom", "Email"]);
    expect(mapHeaders("products", ["Produit"]).missing).toEqual(["Producteur"]);
  });

  it("donne le même nom de colonne au modèle et à l'en-tête du fichier", () => {
    expect(headerKey("  Début   d'adhésion ")).toBe("debut d adhesion");
    expect(mapHeaders("households", templateHeader("households").split(";")).missing).toEqual([]);
  });
});

describe("dates et oui/non", () => {
  it("lit les dates des tableurs", () => {
    expect(parseSheetDate("01/09/2026")).toBe("2026-09-01");
    expect(parseSheetDate("1/9/2026 00:00")).toBe("2026-09-01");
    expect(parseSheetDate("2026-09-01")).toBe("2026-09-01");
    expect(parseSheetDate("31/02/2026")).toBeNull();
    expect(parseSheetDate("septembre")).toBeNull();
  });

  it("lit oui et non", () => {
    expect(["oui", "X", "1", "Vrai"].map(parseYesNo)).toEqual([true, true, true, true]);
    expect(["", "non", "N", "0"].map(parseYesNo)).toEqual([false, false, false, false]);
    expect(parseYesNo("peut-être")).toBeNull();
  });
});

describe("parseHouseholdRow", () => {
  const mapping = mapHeaders("households", templateHeader("households").split(";"));
  const row = (values: Partial<Record<string, string>>) => [
    values.household ?? "",
    values.firstName ?? "Léa",
    values.lastName ?? "Martin",
    values.email ?? "Lea.Martin@Example.org",
    values.phone ?? "06 12 34 56 78",
    values.primary ?? "",
    values.start ?? "01/09/2026",
    values.end ?? "31/08/2027",
    values.duties ?? "7",
  ];

  it("convertit une ligne valable ; le foyer prend le nom de famille s'il n'est pas donné", () => {
    expect(parseHouseholdRow(row({}), mapping, 2)).toEqual({
      line: 2,
      value: {
        household: "Foyer Martin",
        firstName: "Léa",
        lastName: "Martin",
        email: "lea.martin@example.org",
        phone: "+33612345678",
        primary: false,
        membership: { startDate: "2026-09-01", endDate: "2027-08-31" },
        dutyCount: 7,
      },
    });
  });

  it("refuse une ligne avec ses raisons", () => {
    const result = parseHouseholdRow(
      row({
        email: "pas-un-email",
        phone: "12",
        start: "31/08/2027",
        end: "01/09/2026",
        duties: "-1",
      }),
      mapping,
      5,
    );
    expect(result).toEqual({
      line: 5,
      problems: [
        { code: "email", value: "pas-un-email" },
        { code: "phone", value: "12" },
        { code: "dates_order", value: "31/08/2027 – 01/09/2026" },
        { code: "count", value: "-1" },
      ],
    });
    expect(parseHouseholdRow(row({ firstName: "", email: "" }), mapping, 3)).toMatchObject({
      problems: [
        { code: "required", column: "Prénom" },
        { code: "required", column: "Email" },
      ],
    });
  });

  it("accepte une ligne sans adhésion ni antériorité", () => {
    const result = parseHouseholdRow(row({ start: "", end: "", duties: "" }), mapping, 2);
    expect(result).toMatchObject({ value: { membership: null, dutyCount: null } });
  });
});

describe("producteurs et produits", () => {
  it("met le nom du producteur comme ordre des chèques par défaut", () => {
    const mapping = mapHeaders("producers", ["Producteur", "Email"]);
    expect(parseProducerRow(["  Ferme du Pré ", ""], mapping, 2)).toEqual({
      line: 2,
      value: {
        name: "Ferme du Pré",
        category: "",
        email: null,
        phone: null,
        checkPayee: "Ferme du Pré",
        description: "",
      },
    });
  });

  it("exige le producteur et le produit", () => {
    const mapping = mapHeaders("products", ["Producteur", "Produit"]);
    expect(parseProductRow(["Ferme", ""], mapping, 4)).toEqual({
      line: 4,
      problems: [{ code: "required", column: "Produit" }],
    });
  });
});

describe("refuseDuplicates", () => {
  it("garde la première ligne d'une même clé et refuse les suivantes", () => {
    const rows: Array<RowResult<string>> = [
      { line: 2, value: "a" },
      { line: 3, value: "A" },
      { line: 4, problems: [] },
      { line: 5, value: "b" },
    ];
    expect(refuseDuplicates(rows, (v) => v.toLowerCase())).toEqual([
      { line: 2, value: "a" },
      { line: 3, problems: [{ code: "duplicate_in_file" }] },
      { line: 4, problems: [] },
      { line: 5, value: "b" },
    ]);
  });
});

describe("fichier de correspondance (import-mapping.json)", () => {
  it("est valable : sections, colonnes Pomme connues, aucun nom pour deux colonnes", () => {
    expect(checkMapping(mappingFile)).toEqual([]);
  });

  it("signale les erreurs de saisie dans le fichier", () => {
    expect(
      checkMapping({
        adherents: {
          Prenom: [],
          Email: "Mail",
          Nom: ["Nom de famille"],
          Foyer: ["nom de famille"],
        },
        producteurs: {},
      }),
    ).toEqual([
      { code: "unknown_column", section: "adherents", column: "Prenom" },
      { code: "not_a_list", section: "adherents", column: "Email" },
      { code: "duplicate", section: "adherents", name: "nom de famille" },
      { code: "missing_section", section: "produits" },
    ]);
  });

  it("donne ses synonymes aux colonnes ; une colonne absente garde son seul nom Pomme", () => {
    const columns = importColumns({ adherents: { Email: ["Courriel AmapJ"] } });
    expect(columns.households.find((c) => c.key === "email")?.aliases).toEqual(["Courriel AmapJ"]);
    expect(columns.households.find((c) => c.key === "phone")?.aliases).toEqual([]);
    expect(columns.products.map((c) => c.label)).toEqual(["Producteur", "Produit"]);
  });
});

describe("en-têtes des exports AmapJ de Cambremer (2026-11-23, sans données)", () => {
  it("reconnaît l'export des adhérents ; ignore adresse, ville, AMAP et date de création", () => {
    const mapping = mapHeaders(
      "households",
      "Nom;Prénom;Adresse email;n° de téléphone;Adresse;Code postal;Ville;Amaps;date de création".split(
        ";",
      ),
    );
    expect(mapping.columns).toEqual({ lastName: 0, firstName: 1, email: 2, phone: 3 });
    expect(mapping.missing).toEqual([]);
    expect(mapping.ignored).toEqual([
      "Adresse",
      "Code postal",
      "Ville",
      "Amaps",
      "date de création",
    ]);
  });

  it("reconnaît l'export des producteurs : le Label est le nom de la ferme", () => {
    const mapping = mapHeaders(
      "producers",
      "Label;Ordre;Nom;Prénom;N° de téléphone;email;Description".split(";"),
    );
    expect(mapping.columns).toEqual({
      name: 0,
      checkPayee: 1,
      phone: 4,
      email: 5,
      description: 6,
    });
    expect(mapping.missing).toEqual([]);
    // Nom et prénom de la personne de contact : pas de champ dans Pomme.
    expect(mapping.ignored).toEqual(["Nom", "Prénom"]);
  });

  it("reconnaît l'export des produits, mais il n'a pas de colonne Producteur", () => {
    const mapping = mapHeaders("products", ["Label", "Prix unitaire"]);
    expect(mapping.columns).toEqual({ name: 0 });
    expect(mapping.missing).toEqual(["Producteur"]);
  });
});
