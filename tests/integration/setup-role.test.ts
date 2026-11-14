import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupRole } from "@/db/setup";

import { startDatabase, type TestDatabase } from "./helpers/database";

// Préparation des rôles avec un propriétaire sans super-pouvoir, comme sur une base gérée (ADR 0008).
describe("setupRole", () => {
  let db: TestDatabase;
  let ownerUrl: string;

  beforeAll(async () => {
    db = await startDatabase();
    ownerUrl = db.ownerUrl;
  }, 120_000);
  afterAll(async () => db.stop());

  it("peut être relancé sans erreur (chaque démarrage en production)", async () => {
    await expect(
      setupRole({ ownerUrl, appUser: "pomme_app", appPassword: "test_app_password" }),
    ).resolves.toBeUndefined();
  });

  it("refuse un rôle qui pourrait contourner la Row Level Security", async () => {
    const superuser = new Client({ connectionString: db.container.getConnectionUri() });
    await superuser.connect();
    await superuser.query("alter role pomme_app bypassrls");
    await superuser.end();

    await expect(
      setupRole({ ownerUrl, appUser: "pomme_app", appPassword: "test_app_password" }),
    ).rejects.toThrow(/rolbypassrls/);
  });
});
