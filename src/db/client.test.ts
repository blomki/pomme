import { describe, expect, it } from "vitest";

import { poolConfig } from "./client";

describe("poolConfig", () => {
  const url = "postgres://pomme_app:x@db.example.org:5432/pomme";

  it("vérifie le certificat du serveur quand il est fourni (production)", () => {
    expect(poolConfig(url, { DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----" })).toEqual({
      connectionString: url,
      ssl: { ca: "-----BEGIN CERTIFICATE-----", rejectUnauthorized: true },
    });
  });

  it("se connecte sans TLS sinon (base locale)", () => {
    expect(poolConfig(url, {})).toEqual({ connectionString: url });
  });
});
