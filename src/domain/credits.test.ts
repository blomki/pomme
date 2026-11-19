import { describe, expect, it } from "vitest";

import { checkCredit, MAX_CREDIT_CENTS, proposedCreditCents } from "./credits";

describe("proposedCreditCents", () => {
  it("propose le prix payé pour la quantité signalée", () => {
    expect(proposedCreditCents(1, 450)).toBe(450);
    expect(proposedCreditCents(2, 350)).toBe(700);
  });
});

describe("checkCredit", () => {
  const ok = { amountCents: 450, reason: "missing" as const, pickedUp: false };

  it("accepte un montant strictement positif", () => {
    expect(checkCredit(ok)).toEqual([]);
    expect(checkCredit({ ...ok, amountCents: MAX_CREDIT_CENTS })).toEqual([]);
  });

  it("refuse un montant nul, négatif, décimal ou démesuré", () => {
    for (const amountCents of [0, -100, 1.5, MAX_CREDIT_CENTS + 1]) {
      expect(checkCredit({ ...ok, amountCents })).toEqual(["amount"]);
    }
  });

  it("pour « Autre », exige que le référent confirme le retrait du produit", () => {
    expect(checkCredit({ ...ok, reason: "other" })).toEqual(["picked_up"]);
    expect(checkCredit({ ...ok, reason: "other", pickedUp: true })).toEqual([]);
    // Manquant ou abîmé : le panier a été retiré, rien à confirmer.
    expect(checkCredit({ ...ok, reason: "damaged" })).toEqual([]);
  });
});
