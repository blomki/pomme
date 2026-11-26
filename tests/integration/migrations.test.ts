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

  it("créent les tables", async () => {
    const result = await db.owner.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(result.rows.map((r) => r.tablename)).toEqual([
      "account",
      "admin_task",
      "amap",
      "amap_producer",
      "amap_role",
      "audit_log",
      "catalog",
      "catalog_item",
      "catalog_item_availability",
      "cheque",
      "credit",
      "distribution",
      "duty_history",
      "duty_plan",
      "duty_response",
      "duty_slot",
      "household",
      "household_invitation",
      "household_member",
      "join_request",
      "known_device",
      "membership",
      "notification_log",
      "order",
      "order_line",
      "order_period",
      "page",
      "page_redirect",
      "passkey",
      "producer",
      "producer_user",
      "product",
      "referent_assignment",
      "report",
      "session",
      "two_factor",
      "unavailability",
      "user",
      "verification",
    ]);
  });

  it("activent la Row Level Security sur toutes les tables", async () => {
    const result = await db.owner.execute<{ relname: string }>(
      sql`select relname from pg_class
          where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`,
    );
    expect(result.rows).toEqual([]);
  });
});
