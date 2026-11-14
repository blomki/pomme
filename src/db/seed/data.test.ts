import { describe, expect, it } from "vitest";

import { validateAmapSlug } from "@/domain/amap-slug";

import { buildSeedData, DEMO_ACCOUNTS, MEMBERS_PER_AMAP, SECOND_MEMBER_EVERY } from "./data";
import { assertSeedAllowed } from "./index";

describe("buildSeedData", () => {
  const data = buildSeedData();

  it("crée 2 AMAP aux adresses valables", () => {
    expect(data.amaps).toHaveLength(2);
    for (const amap of data.amaps) expect(validateAmapSlug(amap.slug)).toBeNull();
  });

  it("crée 40 amapiens par AMAP (plus les deuxièmes membres) et un gestionnaire", () => {
    const partners = MEMBERS_PER_AMAP / SECOND_MEMBER_EVERY;
    expect(data.users).toHaveLength(2 * (MEMBERS_PER_AMAP + partners) + DEMO_ACCOUNTS.length);
    expect(data.users.filter((u) => u.isPlatformAdmin)).toHaveLength(1);
  });

  it("contient les comptes de démonstration aux adresses fixes", () => {
    const emails = data.users.map((u) => u.email);
    for (const demo of DEMO_ACCOUNTS) expect(emails).toContain(demo.email);
  });

  it("active l'application d'authentification des comptes de démonstration admin et gestionnaire", () => {
    const emails = data.users
      .filter((u) => data.totpUserIds.includes(u.id))
      .map((u) => u.email)
      .sort();
    expect(emails).toEqual(["admin.demo@example.org", "gestionnaire.demo@example.org"]);
  });

  it("est reproductible", () => {
    expect(buildSeedData()).toEqual(data);
  });

  it("n'utilise que des adresses et téléphones fictifs, sans doublon", () => {
    const emails = data.users.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
    for (const u of data.users) {
      expect(u.email).toMatch(/^[a-z.0-9]+@example\.org$/);
      expect(u.phone).toMatch(/^\+3363998\d{4}$/);
    }
  });

  it("donne des identifiants uniques", () => {
    const ids = [
      ...data.users,
      ...data.amaps,
      ...data.roles,
      ...data.households,
      ...data.householdMembers,
    ].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("place une même personne dans les deux AMAP", () => {
    const amapsByUser = new Map<string, Set<string>>();
    for (const role of data.roles) {
      amapsByUser.set(role.userId, (amapsByUser.get(role.userId) ?? new Set()).add(role.amapId));
    }
    expect([...amapsByUser.values()].some((amaps) => amaps.size === 2)).toBe(true);
  });

  it("crée 40 foyers par AMAP aux noms uniques, chacun avec un seul contact principal", () => {
    const demoHouseholds = DEMO_ACCOUNTS.filter((d) => !d.isPlatformAdmin).length;
    const [first, second] = data.amaps;
    const ofAmap = (id?: string) => data.households.filter((h) => h.amapId === id);
    expect(ofAmap(first?.id)).toHaveLength(MEMBERS_PER_AMAP + demoHouseholds);
    expect(ofAmap(second?.id)).toHaveLength(MEMBERS_PER_AMAP);
    for (const amap of data.amaps) {
      const names = ofAmap(amap.id).map((h) => h.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
    for (const h of data.households) {
      const members = data.householdMembers.filter((m) => m.householdId === h.id);
      expect(members.length).toBeGreaterThan(0);
      expect(members.filter((m) => m.isPrimary)).toHaveLength(1);
      expect(members.every((m) => m.amapId === h.amapId)).toBe(true);
    }
  });

  it("place chaque personne dans un seul foyer par AMAP", () => {
    const keys = data.householdMembers.map((m) => `${m.amapId}:${m.userId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("donne au moins un administrateur à chaque AMAP", () => {
    for (const amap of data.amaps) {
      expect(data.roles.some((r) => r.amapId === amap.id && r.role === "admin")).toBe(true);
    }
  });
});

describe("assertSeedAllowed", () => {
  it("accepte une base locale", () => {
    expect(() => assertSeedAllowed("postgres://u:p@localhost:5432/pomme", {})).not.toThrow();
  });

  it("refuse une base distante", () => {
    expect(() => assertSeedAllowed("postgres://u:p@db.example.com/pomme", {})).toThrow();
  });

  it("accepte une base distante jetable si on le demande explicitement", () => {
    expect(() =>
      assertSeedAllowed("postgres://u:p@db.example.com/pomme", { SEED_ALLOW_REMOTE: "1" }),
    ).not.toThrow();
  });

  it("refuse toujours en production", () => {
    expect(() =>
      assertSeedAllowed("postgres://u:p@localhost/pomme", { NODE_ENV: "production" }),
    ).toThrow();
  });
});
