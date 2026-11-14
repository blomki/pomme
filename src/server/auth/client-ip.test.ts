import { describe, expect, it } from "vitest";

import { clientIp } from "./client-ip";

describe("clientIp", () => {
  it("prend la dernière adresse, ajoutée par le répartiteur de charge", () => {
    // Le robot envoie une fausse adresse ; Sōzu ajoute la vraie à la fin.
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("accepte une adresse seule", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("se rabat sur X-Real-IP, puis sur une valeur fixe", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("inconnue");
  });
});
