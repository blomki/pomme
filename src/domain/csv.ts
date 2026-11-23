/**
 * Lecture d'un fichier CSV (story K1, reprise depuis AmapJ). Les fichiers viennent le plus souvent
 * d'Excel ou de LibreOffice « enregistré sous CSV » : en France, le séparateur est le
 * point-virgule (la virgule sert aux nombres décimaux), parfois la virgule ou la tabulation. On
 * le devine d'après la première ligne. Les champs entre guillemets peuvent contenir le
 * séparateur, des retours à la ligne et des guillemets doublés (« "" »).
 */

export type CsvTable = { headers: string[]; rows: string[][] };

/** Séparateur le plus présent dans la première ligne (hors guillemets) : « ; », « , » ou tabulation. */
export function guessSeparator(firstLine: string): string {
  const outside = firstLine.replace(/"[^"]*"/g, "");
  const candidates = [";", ",", "\t"];
  const counts = candidates.map((c) => outside.split(c).length - 1);
  const best = counts.indexOf(Math.max(...counts));
  return counts[best]! > 0 ? candidates[best]! : ";";
}

/**
 * Découpe le texte en lignes et en champs. La première ligne non vide donne les en-têtes ; les
 * lignes entièrement vides sont ignorées. Les espaces autour des valeurs sont retirés.
 *
 * @example parseCsv("nom;email\nMartin;a@b.fr") // { headers: ["nom", "email"], rows: [["Martin", "a@b.fr"]] }
 */
export function parseCsv(text: string): CsvTable {
  // Marque d'ordre des octets (BOM) qu'Excel ajoute en tête des fichiers UTF-8.
  const input = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const separator = guessSeparator(input.split("\n", 1)[0] ?? "");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (char === separator) {
      record.push(field.trim());
      field = "";
    } else if (char === "\n") {
      record.push(field.trim());
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  record.push(field.trim());
  records.push(record);
  const nonEmpty = records.filter((r) => r.some((value) => value !== ""));
  const [headers = [], ...rows] = nonEmpty;
  return { headers, rows };
}
