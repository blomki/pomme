import { describe, expect, it } from "vitest";

import { buildOrderForm } from "@/domain/order-forms";

import { orderFormEmail } from "./order-form-email";

describe("orderFormEmail", () => {
  const form = buildOrderForm({
    distributions: [
      { id: "d1", date: "2026-12-03" },
      { id: "d2", date: "2026-12-10" },
    ],
    items: [{ itemId: "eggs", name: "Œufs, boîte de 6", priceCents: 400 }],
    lines: [
      { householdId: "h", itemId: "eggs", distributionId: "d1", quantity: 3, unitPriceCents: 400 },
    ],
    households: [{ id: "h", name: "Foyer Essai", cheque: null }],
  });
  const email = orderFormEmail({
    amap: { name: "AMAP des Tests", theme: null },
    producer: "Ferme d'essai",
    month: "décembre",
    form,
    printUrl: "https://pomme.example.org/amap-des-tests/bon-de-commande/x/2026-12?cle=abc",
    validUntil: new Date("2027-01-25T10:00:00Z"),
  });

  it("dit quoi préparer à chaque distribution, et le total", () => {
    expect(email.subject).toBe("AMAP des Tests : bon de commande de décembre");
    expect(email.text).toContain("jeudi 3 décembre : 3 × Œufs, boîte de 6");
    expect(email.text).not.toContain("10 décembre");
    expect(email.text).toMatch(/12,00\s€ au total/);
  });

  it("mène à la version à imprimer, avec la date de fin du lien, sans nom de foyer", () => {
    expect(email.text).toContain("/bon-de-commande/x/2026-12?cle=abc");
    expect(email.text).toContain("25 janvier 2027");
    expect(email.text).not.toContain("Foyer Essai");
  });
});
