import { describe, expect, it } from "vitest";

import { magicLinkEmail } from "./magic-link-email";

describe("magicLinkEmail", () => {
  const url = "http://localhost:3000/api/auth/magic-link/verify?token=abc&callbackURL=%2F";
  const email = magicLinkEmail(url, 15);

  it("contient le lien en clair dans la version texte", () => {
    expect(email.text).toContain(url);
    expect(email.text).toContain("15 minutes");
  });

  it("échappe le lien dans la version HTML", () => {
    expect(email.html).toContain("token=abc&amp;callbackURL");
    expect(email.html).not.toContain("token=abc&callbackURL");
  });

  it("a un objet en français", () => {
    expect(email.subject).toMatch(/connexion/i);
  });
});
