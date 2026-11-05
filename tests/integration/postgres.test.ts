import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startPostgres } from "./helpers/postgres";

// Test de mise en place : prouve que les tests d'intégration disposent d'un vrai PostgreSQL 17.
// La fiche S3 y ajoutera les migrations et les tests d'isolation par AMAP (RLS).
describe("PostgreSQL de test", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startPostgres();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it("répond en version 17", async () => {
    const client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    try {
      const result = await client.query<{ server_version_num: string }>("SHOW server_version_num");
      expect(Number(result.rows[0]?.server_version_num)).toBeGreaterThanOrEqual(170000);
    } finally {
      await client.end();
    }
  });
});
