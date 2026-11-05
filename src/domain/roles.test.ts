import { describe, expect, it } from "vitest";

import { hasAnyRole } from "./roles";

describe("hasAnyRole", () => {
  it("accepte un utilisateur qui a le rôle demandé", () => {
    expect(hasAnyRole(["admin"], ["admin"])).toBe(true);
  });

  it("accepte un utilisateur qui a l'un des rôles demandés", () => {
    expect(hasAnyRole(["referent"], ["admin", "referent"])).toBe(true);
  });

  it("refuse un utilisateur qui n'a aucun des rôles demandés", () => {
    expect(hasAnyRole(["referent"], ["admin"])).toBe(false);
  });

  it("refuse un utilisateur sans rôle", () => {
    expect(hasAnyRole([], ["admin", "referent"])).toBe(false);
  });
});
