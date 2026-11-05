import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startDatabase, type TestDatabase } from "./helpers/database";

// Les migrations s'appliquent sur une base vide et activent la RLS sur chaque table.
describe("Migrations", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await startDatabase();
  });

  afterAll(async () => {
    await db?.stop();
  });

  it("créent les tables de départ", async () => {
    const result = await db.owner.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(result.rows.map((r) => r.tablename)).toEqual(["amap", "amap_role", "audit_log", "user"]);
  });

  it("activent la Row Level Security sur toutes les tables", async () => {
    const result = await db.owner.execute<{ relname: string }>(
      sql`select relname from pg_class
          where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`,
    );
    expect(result.rows).toEqual([]);
  });
});
