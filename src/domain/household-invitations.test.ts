import { describe, expect, it } from "vitest";

import { invitationExpiry, invitationSessionCase, invitationState } from "./household-invitations";

describe("invitations dans un foyer", () => {
  const now = new Date("2026-11-26T10:00:00Z");

  it("sont valables 7 jours", () => {
    expect(invitationExpiry(now)).toEqual(new Date("2026-12-03T10:00:00Z"));
  });

  it("sont en attente, expirées, acceptées ou annulées", () => {
    const base = { expiresAt: invitationExpiry(now), acceptedAt: null, cancelledAt: null };
    expect(invitationState(base, now)).toBe("pending");
    expect(invitationState(base, new Date("2026-12-03T10:00:00Z"))).toBe("expired");
    expect(invitationState({ ...base, acceptedAt: now }, now)).toBe("accepted");
    expect(invitationState({ ...base, acceptedAt: now, cancelledAt: now }, now)).toBe("cancelled");
  });
});

describe("invitationSessionCase", () => {
  it("personne de connecté", () => {
    expect(invitationSessionCase(null, "b@example.org")).toBe("none");
  });

  it("la personne invitée elle-même, quelle que soit la casse", () => {
    expect(invitationSessionCase("B@Example.org", "b@example.org")).toBe("invitee");
  });

  it("un autre compte", () => {
    expect(invitationSessionCase("a@example.org", "b@example.org")).toBe("other");
  });
});
