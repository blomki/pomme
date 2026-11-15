import { describe, expect, it } from "vitest";

import { invitationEmail, invitationLoginUrl, producerInvitationEmail } from "./invitation-email";

describe("invitationEmail", () => {
  const email = invitationEmail({
    amap: { name: "AMAP des Tests", theme: null },
    firstName: "Claude",
    loginUrl: "https://pomme.example.org/connexion?email=claude%40example.org",
  });

  it("s'adresse à la personne, au nom de l'AMAP", () => {
    expect(email.subject).toContain("AMAP des Tests");
    expect(email.text).toContain("Bonjour Claude");
  });

  it("mène à la page de connexion, sans jeton de connexion", () => {
    expect(email.text).toContain("https://pomme.example.org/connexion?email=claude%40example.org");
    expect(email.text).not.toMatch(/token=/);
  });
});

describe("invitationLoginUrl", () => {
  it("remplit l'adresse sur la page de connexion", () => {
    expect(invitationLoginUrl("https://pomme.example.org", "a+b@example.org")).toBe(
      "https://pomme.example.org/connexion?email=a%2Bb%40example.org",
    );
  });
});

describe("producerInvitationEmail", () => {
  it("nomme le producteur et l'AMAP, sans jeton de connexion", () => {
    const email = producerInvitationEmail({
      amap: { name: "AMAP des Tests", theme: null },
      firstName: "Camille",
      producerName: "Ruches d'essai",
      loginUrl: "https://pomme.example.org/connexion?email=c%40example.org",
    });
    expect(email.subject).toContain("Ruches d'essai");
    expect(email.text).toContain("Bonjour Camille");
    expect(email.text).toContain("AMAP des Tests");
    expect(email.text).not.toMatch(/token=/);
  });
});
