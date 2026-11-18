import { describe, expect, it } from "vitest";

import {
  duplicateNames,
  formatEuros,
  isCatalogReadOnly,
  normalizeProductName,
  parsePriceCents,
  priceInput,
  publishDeadline,
  publishProblem,
  sameProductName,
} from "./catalog";

describe("parsePriceCents", () => {
  it.each([
    ["4,00", 400],
    ["4", 400],
    ["7.5", 750],
    ["7,5", 750],
    ["0,01", 1],
    ["12,50 €", 1250],
    [" 1 250,00 ", 125000],
    ["10000", 1000000],
  ])("lit « %s » : %i centimes", (input, cents) => {
    expect(parsePriceCents(input)).toBe(cents);
  });

  it.each(["", "0", "0,00", "-4", "4,005", "abc", "4,0,0", "10000,01"])(
    "refuse « %s »",
    (input) => {
      expect(parsePriceCents(input)).toBeNull();
    },
  );

  it("ne fait jamais d'arrondi de nombre à virgule", () => {
    // 0,29 × 100 vaut 28,999… en virgule flottante : le calcul se fait sur les chiffres.
    expect(parsePriceCents("0,29")).toBe(29);
    expect(parsePriceCents("1,15")).toBe(115);
  });
});

describe("affichage", () => {
  it("affiche un prix en euros, à la française", () => {
    expect(formatEuros(750).replace(/\s/g, " ")).toBe("7,50 €");
  });

  it("prépare un prix pour un champ de saisie", () => {
    expect(priceInput(750)).toBe("7,50");
    expect(priceInput(400)).toBe("4,00");
  });
});

describe("noms de produit", () => {
  it("retire les espaces en trop", () => {
    expect(normalizeProductName("  Œufs,   boîte de 6 ")).toBe("Œufs, boîte de 6");
  });

  it("compare sans tenir compte des majuscules ni des espaces", () => {
    expect(sameProductName("Œufs, boîte de 6", " œufs,  BOÎTE de 6")).toBe(true);
    expect(sameProductName("Œufs, boîte de 6", "Œufs, boîte de 12")).toBe(false);
  });

  it("repère les noms en double parmi les produits proposés seulement", () => {
    expect(
      duplicateNames([
        { name: "Œufs, boîte de 6", removed: false },
        { name: "œufs, boîte de 6", removed: false },
        { name: "Miel", removed: false },
        { name: "Miel", removed: true },
      ]),
    ).toEqual(["Œufs, boîte de 6"]);
  });
});

describe("isCatalogReadOnly", () => {
  it("bloque un mois passé ou dont les commandes sont clôturées", () => {
    const base = { currentMonth: "2026-11", ordersClosed: false };
    expect(isCatalogReadOnly({ ...base, month: "2026-12" })).toBe(false);
    expect(isCatalogReadOnly({ ...base, month: "2026-11" })).toBe(false);
    expect(isCatalogReadOnly({ ...base, month: "2026-10" })).toBe(true);
    expect(isCatalogReadOnly({ ...base, month: "2026-12", ordersClosed: true })).toBe(true);
  });
});

describe("publishProblem", () => {
  const line = (name: string, available: string[], removed = false) => ({
    name,
    available,
    removed,
  });

  it("accepte un catalogue dont chaque produit proposé a au moins une semaine", () => {
    expect(publishProblem([line("Pain", ["d1"]), line("Brioche", [], true)])).toBeNull();
  });

  it("refuse un catalogue sans produit proposé", () => {
    expect(publishProblem([])).toEqual({ kind: "empty" });
    expect(publishProblem([line("Pain", ["d1"], true)])).toEqual({ kind: "empty" });
  });

  it("nomme les produits disponibles à aucune semaine", () => {
    expect(publishProblem([line("Pain", []), line("Miel", ["d1"]), line("Œufs", [])])).toEqual({
      kind: "no_week",
      names: ["Pain", "Œufs"],
    });
  });
});

describe("publishDeadline", () => {
  it("tombe trois jours avant l'ouverture, en changeant de mois si besoin", () => {
    expect(publishDeadline("2026-11-15")).toBe("2026-11-12");
    expect(publishDeadline("2026-12-02")).toBe("2026-11-29");
  });
});
