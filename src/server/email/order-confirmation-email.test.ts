import { describe, expect, it } from "vitest";

import { orderConfirmationEmail } from "./order-confirmation-email";

describe("orderConfirmationEmail", () => {
  const email = orderConfirmationEmail({
    amap: { name: "AMAP des Tests", theme: null },
    firstName: "Claude",
    month: "décembre",
    closesOn: "mercredi 25 novembre",
    producers: [
      { name: "Ferme d'essai", checkPayee: "GAEC d'essai", totalCents: 4800 },
      { name: "Fournil d'essai", checkPayee: "", totalCents: 1250 },
    ],
    totalCents: 6050,
    orderUrl: "https://pomme.example.org/hommesdeterre/famille/commande/recapitulatif",
  });

  it("liste un chèque par producteur, avec son ordre, et le total", () => {
    expect(email.subject).toBe("AMAP des Tests : votre commande de décembre est enregistrée");
    expect(email.text).toContain("Bonjour Claude");
    expect(email.text).toMatch(/Ferme d'essai : 48,00\s€, à l'ordre de « GAEC d'essai »/);
    expect(email.text).toMatch(/Fournil d'essai : 12,50\s€/);
    expect(email.text).toMatch(/Total provisoire : 60,50\s€/);
    expect(email.text).toContain("jusqu'au mercredi 25 novembre inclus");
  });

  it("mène au récapitulatif, sans jeton de connexion", () => {
    expect(email.text).toContain("/hommesdeterre/famille/commande/recapitulatif");
    expect(email.text).not.toMatch(/token=/);
  });
});
