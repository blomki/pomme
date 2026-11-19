import { describe, expect, it } from "vitest";

import { coversDay, membershipState } from "@/domain/memberships";

import { validateAmapSlug } from "@/domain/amap-slug";

import { buildSeedData, DEMO_ACCOUNTS, MEMBERS_PER_AMAP, SECOND_MEMBER_EVERY } from "./data";
import { assertSeedAllowed } from "./index";

describe("buildSeedData", () => {
  // Jour de référence fixe : le jeu de données ne dépend pas du jour où le test tourne.
  const today = new Date("2026-11-15T10:00:00Z");
  const data = buildSeedData(today);

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
    expect(buildSeedData(today)).toEqual(data);
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
      ...data.producers,
      ...data.amapProducers,
      ...data.referentAssignments,
      ...data.producerUsers,
      ...data.distributions,
      ...data.products,
      ...data.catalogs,
      ...data.catalogItems,
      ...data.availabilities,
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
    const demoHouseholds = DEMO_ACCOUNTS.filter((d) => !d.isPlatformAdmin && !d.producer).length;
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

  it("crée des producteurs fictifs, dont un commun aux deux AMAP et un sans référent", () => {
    const [first, second] = data.amaps;
    const inAmap = (id?: string) => data.amapProducers.filter((ap) => ap.amapId === id);
    expect(inAmap(first?.id)).toHaveLength(6);
    expect(inAmap(second?.id)).toHaveLength(3);
    const shared = data.producers.filter(
      (p) => data.amapProducers.filter((ap) => ap.producerId === p.id).length === 2,
    );
    expect(shared.length).toBeGreaterThan(0);
    const withoutReferent = inAmap(first?.id).filter(
      (ap) => !data.referentAssignments.some((r) => r.amapProducerId === ap.id),
    );
    expect(withoutReferent).toHaveLength(1);
    // Chaque référent affecté a bien le rôle référent dans cette AMAP.
    for (const assignment of data.referentAssignments) {
      expect(
        data.roles.some(
          (r) =>
            r.amapId === assignment.amapId &&
            r.userId === assignment.userId &&
            r.role === "referent",
        ),
      ).toBe(true);
    }
    for (const p of data.producers) {
      expect(p.email).toMatch(/@example\.org$/);
      expect(p.phone).toMatch(/^\+3363998\d{4}$/);
    }
  });

  it("confie deux producteurs au référent de démonstration et crée un compte producteur", () => {
    const robin = data.users.find((u) => u.email === "referent.demo@example.org");
    expect(data.referentAssignments.filter((r) => r.userId === robin?.id)).toHaveLength(2);
    const ange = data.users.find((u) => u.email === "producteur.demo@example.org");
    expect(data.producerUsers.map((pu) => pu.userId)).toEqual([ange?.id]);
    // Un compte producteur n'a pas de foyer.
    expect(data.householdMembers.some((m) => m.userId === ange?.id)).toBe(false);
  });

  it("crée les distributions de trois mois au jour habituel, dont une fermée à Noël", () => {
    const [first] = data.amaps;
    const ofFirst = data.distributions.filter((d) => d.amapId === first?.id);
    // Jeudis de novembre 2026 (4), décembre (5) et janvier 2027 (4).
    expect(ofFirst).toHaveLength(13);
    expect(ofFirst.filter((d) => !d.isOpen)).toEqual([
      expect.objectContaining({ date: "2026-12-31", closedReason: "Vacances de Noël" }),
    ]);
    expect(first?.settings.distributionWeekday).toBe(4);
  });

  it("prépare des brouillons de catalogue disponibles à chaque distribution ouverte", () => {
    // 7 producteurs × 2 produits ; 9 producteurs dans les AMAP × 2 mois de catalogues.
    expect(data.products).toHaveLength(14);
    expect(data.catalogs).toHaveLength(18);
    expect(data.catalogItems).toHaveLength(36);
    expect(data.catalogItems.every((i) => i.priceCents > 0)).toBe(true);
    const closed = new Set(data.distributions.filter((d) => !d.isOpen).map((d) => d.id));
    expect(data.availabilities.some((a) => closed.has(a.distributionId))).toBe(false);
    for (const a of data.availabilities) {
      const item = data.catalogItems.find((i) => i.id === a.catalogItemId);
      const d = data.distributions.find((x) => x.id === a.distributionId);
      expect(item?.amapId).toBe(d?.amapId);
    }
  });

  it("ouvre la période du mois suivant et fait commander 12 foyers de la première AMAP", () => {
    const [period, current] = data.orderPeriods;
    expect(data.orderPeriods).toHaveLength(2);
    expect(period?.amapId).toBe(data.amaps[0]?.id);
    expect(period?.month).toBe("2026-12-01");
    expect(period!.opensAt < today && today < period!.closesAt).toBe(true);
    // Le mois en cours : commandes clôturées le mois dernier, un chèque par foyer et producteur.
    expect(current).toMatchObject({ month: "2026-11-01", status: "closed" });
    expect(current!.closesAt < today).toBe(true);
    // 12 foyers, plus celui de amapien.demo pour le mois en cours (F5).
    expect(new Set(data.orders.map((o) => o.householdId)).size).toBe(13);
    expect(data.orders).toHaveLength(50);
    expect(data.cheques).toHaveLength(26);
    for (const c of data.cheques) expect(c.expectedCents).toBe(c.grossCents);
    for (const line of data.orderLines) {
      const item = data.catalogItems.find((i) => i.id === line.catalogItemId);
      expect(line.unitPriceCents).toBe(item?.priceCents);
      expect(line.quantity).toBeGreaterThan(0);
    }
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

  it("donne une adhésion à la plupart des foyers, et quelques foyers dans chaque autre état", () => {
    const today = new Date("2026-11-18T10:00:00Z");
    const data = buildSeedData(today);
    const states = data.households.map((h) =>
      membershipState(
        data.memberships.filter((m) => m.householdId === h.id),
        "2026-11-18",
      ),
    );
    const count = (status: string) => states.filter((s) => s.status === status).length;
    expect(count("active")).toBeGreaterThan(data.households.length / 2);
    for (const status of ["expiring", "upcoming", "expired", "none"]) {
      expect(count(status)).toBeGreaterThan(0);
    }
    // Les foyers qui commandent sont adhérents.
    for (const o of data.orders) {
      const own = data.memberships.filter((m) => m.householdId === o.householdId);
      expect(coversDay(own, "2026-11-18")).toBe(true);
    }
  });
});
