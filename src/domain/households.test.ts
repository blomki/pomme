import { describe, expect, it } from "vitest";

import {
  canRevokeAdmin,
  checkNewMembers,
  memberStatus,
  normalizeHouseholdName,
} from "./households";

describe("normalizeHouseholdName", () => {
  it("retire les espaces en trop", () => {
    expect(normalizeHouseholdName("  Foyer   Martin ")).toBe("Foyer Martin");
  });
});

describe("memberStatus", () => {
  it("dit « invité » tant que la personne ne s'est jamais connectée", () => {
    expect(memberStatus({ emailVerified: false })).toBe("invited");
  });

  it("dit « actif » après sa première connexion", () => {
    expect(memberStatus({ emailVerified: true })).toBe("active");
  });
});

describe("checkNewMembers", () => {
  const member = (email: string, isPrimary = false) => ({ email, isPrimary });

  it("accepte un membre principal seul", () => {
    expect(checkNewMembers([member("a@example.org", true)])).toBeNull();
  });

  it("accepte plusieurs membres avec un seul contact principal", () => {
    expect(checkNewMembers([member("a@example.org", true), member("b@example.org")])).toBeNull();
  });

  it("refuse un foyer sans membre", () => {
    expect(checkNewMembers([])).toBe("no_member");
  });

  it("refuse deux fois la même adresse, même avec des majuscules", () => {
    expect(checkNewMembers([member("a@example.org", true), member("A@Example.org")])).toBe(
      "duplicate_email",
    );
  });

  it("exige exactement un contact principal", () => {
    expect(checkNewMembers([member("a@example.org"), member("b@example.org")])).toBe(
      "primary_count",
    );
    expect(checkNewMembers([member("a@example.org", true), member("b@example.org", true)])).toBe(
      "primary_count",
    );
  });
});

describe("canRevokeAdmin", () => {
  it("refuse de retirer le dernier administrateur", () => {
    expect(canRevokeAdmin(1)).toBe(false);
  });

  it("accepte s'il en reste au moins un autre", () => {
    expect(canRevokeAdmin(2)).toBe(true);
  });
});
