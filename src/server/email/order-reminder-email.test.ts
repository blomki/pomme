import { describe, expect, it } from "vitest";

import { orderReminderEmail } from "./order-reminder-email";

describe("orderReminderEmail", () => {
  const email = orderReminderEmail({
    amap: { name: "AMAP des Tests", theme: null },
    firstName: "Claude",
    month: "décembre",
    closesOn: "mercredi 25 novembre",
    orderUrl: "https://pomme.example.org/hommesdeterre/famille",
  });

  it("donne le mois et le dernier jour pour commander", () => {
    expect(email.subject).toBe(
      "AMAP des Tests : les commandes de décembre ferment le mercredi 25 novembre",
    );
    expect(email.text).toContain("Bonjour Claude");
    expect(email.text).toContain("jusqu'au mercredi 25 novembre inclus");
  });

  it("mène à l'espace famille, sans jeton de connexion", () => {
    expect(email.text).toContain("https://pomme.example.org/hommesdeterre/famille");
    expect(email.text).not.toMatch(/token=/);
  });
});
