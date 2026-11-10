import { describe, expect, it } from "vitest";

import { BLOCKING_STATUSES, dedupeKey } from "./notifications";

describe("dedupeKey", () => {
  it("assemble modèle, personne et occasion", () => {
    expect(dedupeKey("order_reminder", "u1", "period-2026-12")).toBe(
      "order_reminder:u1:period-2026-12",
    );
  });

  it("donne une clé différente pour une autre occasion ou une autre personne", () => {
    const a = dedupeKey("order_reminder", "u1", "p1");
    expect(dedupeKey("order_reminder", "u1", "p2")).not.toBe(a);
    expect(dedupeKey("order_reminder", "u2", "p1")).not.toBe(a);
  });
});

describe("BLOCKING_STATUSES", () => {
  it("bloque un nouvel envoi après un envoi réussi ou en cours, pas après un échec", () => {
    expect(BLOCKING_STATUSES).toEqual(["pending", "sent"]);
  });
});
