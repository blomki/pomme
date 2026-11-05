import { describe, expect, it } from "vitest";

import { parseAppCredentials } from "./setup";

describe("parseAppCredentials", () => {
  it("lit l'utilisateur et le mot de passe", () => {
    expect(parseAppCredentials("postgres://pomme_app:secret@localhost:5432/pomme")).toEqual({
      appUser: "pomme_app",
      appPassword: "secret",
    });
  });

  it("décode les caractères spéciaux du mot de passe", () => {
    expect(parseAppCredentials("postgres://pomme_app:a%40b%2Fc@localhost/pomme").appPassword).toBe(
      "a@b/c",
    );
  });

  it("refuse une adresse sans mot de passe", () => {
    expect(() => parseAppCredentials("postgres://pomme_app@localhost/pomme")).toThrow();
  });
});
