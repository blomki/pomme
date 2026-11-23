import { describe, expect, it } from "vitest";

import { guessSeparator, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("lit un CSV d'Excel français : point-virgule, BOM, fins de ligne Windows", () => {
    expect(parseCsv("﻿Nom;Prénom\r\nMartin;Léa\r\n\r\nDurand ; Paul \r\n")).toEqual({
      headers: ["Nom", "Prénom"],
      rows: [
        ["Martin", "Léa"],
        ["Durand", "Paul"],
      ],
    });
  });

  it("garde séparateurs, retours à la ligne et guillemets dans un champ entre guillemets", () => {
    expect(parseCsv('nom,description\n"Ferme, du Pré","Œufs\n""bio"""')).toEqual({
      headers: ["nom", "description"],
      rows: [["Ferme, du Pré", 'Œufs\n"bio"']],
    });
  });

  it("devine le séparateur d'après la première ligne", () => {
    expect(guessSeparator("a;b;c")).toBe(";");
    expect(guessSeparator("a,b,c")).toBe(",");
    expect(guessSeparator("a\tb")).toBe("\t");
    expect(guessSeparator('"a;b",c,d')).toBe(",");
    expect(guessSeparator("seul")).toBe(";");
  });

  it("donne un tableau vide pour un fichier vide", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});
