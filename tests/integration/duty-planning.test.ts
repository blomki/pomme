import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  distribution,
  dutyHistory,
  dutyPlan,
  dutySlot,
  household,
  householdMember,
  orderPeriod,
  unavailability,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError } from "@/server/auth/errors";
import {
  generateQuarterPlanning,
  getMonthDuties,
  getPlanningBanner,
  getPlanningEditor,
  planChangeNotice,
  savePlanning,
  sendPlanning,
} from "@/server/duty-planning";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Planning des permanences (story G2), avec la vraie base et la Row Level Security.
// Le 20 décembre 2026 : trimestre en cours d'octobre à décembre, prochain de janvier à mars.
const NOW = new Date("2026-12-20T10:00:00Z");

describe("Planning des permanences (G2)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string; firstName: string };
  let people: Array<{ id: string; firstName: string }>;
  let jan: string[];
  let novDistribution: string;
  let planId: string;

  const ctxOf = (userId: string, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const run = <T>(userId: string, fn: Parameters<typeof withAmapContext<T>>[2], amapId?: string) =>
    withAmapContext(db.app, ctxOf(userId, amapId), fn);
  const slotsOf = async () =>
    db.owner.select().from(dutySlot).where(eq(dutySlot.dutyPlanId, planId));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-g2");
    amapB = await f.createAmap("amap-g2-autre");
    admin = await f.createUser({ firstName: "Alix" });
    people = [admin];
    for (const firstName of ["Bea", "Cyril", "Dina", "Eli", "Fanny"]) {
      people.push(await f.createUser({ firstName }));
    }
    await f.grantRole(amapA.id, admin.id, "admin");
    for (const p of people) {
      const id = uuidv7();
      await db.owner
        .insert(household)
        .values({ id, amapId: amapA.id, name: `Foyer ${p.firstName}` });
      await db.owner
        .insert(householdMember)
        .values({ amapId: amapA.id, householdId: id, userId: p.id, isPrimary: true });
    }
    // Alix et Bea sont expérimentées (antériorité AmapJ).
    await db.owner.insert(dutyHistory).values([
      { amapId: amapA.id, userId: admin.id, importedCount: 10 },
      { amapId: amapA.id, userId: people[1]!.id, importedCount: 7 },
    ]);
    jan = ["2027-01-07", "2027-01-14", "2027-01-21", "2027-01-28"].map(() => uuidv7());
    novDistribution = uuidv7();
    await db.owner.insert(distribution).values([
      ...["2027-01-07", "2027-01-14", "2027-01-21", "2027-01-28"].map((date, i) => ({
        id: jan[i]!,
        amapId: amapA.id,
        date,
        startTime: "18:00",
        endTime: "19:30",
      })),
      {
        id: novDistribution,
        amapId: amapA.id,
        date: "2026-11-19",
        startTime: "18:00",
        endTime: "19:30",
      },
    ]);
    // Période de réponse du prochain trimestre close ; Dina indisponible le 7 janvier.
    const instants = periodInstants("2026-11-22", "2026-12-13");
    planId = uuidv7();
    await db.owner.insert(dutyPlan).values({
      id: planId,
      amapId: amapA.id,
      quarterStart: "2027-01-01",
      opensAt: instants.opensAt,
      unavailabilityDeadline: instants.closesAt,
    });
    await db.owner.insert(unavailability).values({
      amapId: amapA.id,
      dutyPlanId: planId,
      userId: people[3]!.id,
      distributionId: jan[0]!,
    });
  });

  it("génère 3 bénévoles par distribution, équitablement, sans les indisponibles (accès autorisé)", async () => {
    expect(
      await run(admin.id, (tx, ctx) => generateQuarterPlanning(tx, ctx, { quarter: "next" }, NOW)),
    ).toEqual({ status: "generated", planId, count: 12 });
    const slots = await slotsOf();
    for (const d of jan) {
      const ids = slots.filter((s) => s.distributionId === d).map((s) => s.userId);
      expect(ids).toHaveLength(3);
      // Toujours un expérimenté (Alix ou Bea).
      expect(ids.some((id) => id === admin.id || id === people[1]!.id)).toBe(true);
    }
    expect(slots.some((s) => s.distributionId === jan[0] && s.userId === people[3]!.id)).toBe(
      false,
    );
    const perPerson = people.map((p) => slots.filter((s) => s.userId === p.id).length);
    expect(Math.max(...perPerson) - Math.min(...perPerson)).toBeLessThanOrEqual(1);
    const [plan] = await db.owner.select().from(dutyPlan).where(eq(dutyPlan.id, planId));
    expect(plan?.status).toBe("draft");
  });

  it("refuse un amapien sans rôle admin (accès refusé)", async () => {
    await expect(
      run(people[2]!.id, (tx, ctx) => generateQuarterPlanning(tx, ctx, { quarter: "next" }, NOW)),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      run(people[2]!.id, (tx, ctx) =>
        savePlanning(tx, ctx, { planId, notify: false, rows: [] }, NOW),
      ),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      run(people[2]!.id, (tx, ctx) => sendPlanning(tx, ctx, { planId }, NOW)),
    ).rejects.toThrow(ForbiddenError);
    // La base refuse aussi d'écrire une case.
    await expect(
      run(people[2]!.id, (tx) => tx.delete(dutySlot).where(eq(dutySlot.dutyPlanId, planId))),
    ).resolves.toBeDefined();
    expect(await slotsOf()).toHaveLength(12);
  });

  it("montre l'éditeur : mois, cases, expérience et indisponibilités", async () => {
    const view = await run(admin.id, (tx, ctx) => getPlanningEditor(tx, ctx, "next", NOW));
    expect(view.months.map((m) => [m.month, m.readOnly, m.distributions.length])).toEqual([
      ["2027-01", false, 4],
    ]);
    expect(view.plan).toMatchObject({ status: "draft", answersPhase: "closed", generated: true });
    expect(view.people.find((p) => p.userId === people[3]!.id)?.unavailable).toEqual([jan[0]]);
    expect(view.people.find((p) => p.userId === admin.id)?.experience).toBe(10);
  });

  it("enregistre le brouillon sans prévenir personne ; refuse un mois passé", async () => {
    const rows = [{ distributionId: jan[3]!, userIds: [admin.id, people[4]!.id, null] }];
    expect(
      await run(admin.id, (tx, ctx) => savePlanning(tx, ctx, { planId, notify: true, rows }, NOW)),
    ).toEqual({ status: "saved", notifyNow: [], pending: [] });
    expect((await slotsOf()).filter((s) => s.distributionId === jan[3])).toHaveLength(2);
    // Novembre est passé (trimestre en cours) : refusé.
    const current = await run(admin.id, (tx, ctx) =>
      generateQuarterPlanning(tx, ctx, { quarter: "current" }, NOW),
    );
    expect(current.status).toBe("generated");
    const currentPlan = current.status === "generated" ? current.planId : "";
    expect(
      await run(admin.id, (tx, ctx) =>
        savePlanning(
          tx,
          ctx,
          {
            planId: currentPlan,
            notify: false,
            rows: [{ distributionId: novDistribution, userIds: [] }],
          },
          NOW,
        ),
      ),
    ).toEqual({ status: "past" });
  });

  it("envoie le planning : chaque bénévole reçoit ses dates", async () => {
    const notice = await run(admin.id, (tx, ctx) => sendPlanning(tx, ctx, { planId }, NOW));
    expect(notice).toMatchObject({ status: "ready", kind: "planning" });
    if (notice.status !== "ready") return;
    const alix = notice.recipients.find((r) => r.userId === admin.id);
    expect(alix?.dates.length).toBeGreaterThan(0);
    expect(alix?.dates.every((d) => d.startsWith("2027-01"))).toBe(true);
    const [plan] = await db.owner.select().from(dutyPlan).where(eq(dutyPlan.id, planId));
    expect(plan?.status).toBe("sent");
    // Après l'envoi, plus de regénération.
    expect(
      await run(admin.id, (tx, ctx) => generateQuarterPlanning(tx, ctx, { quarter: "next" }, NOW)),
    ).toEqual({ status: "already_sent" });
  });

  it("après l'envoi : prévenir tout de suite, ou garder la liste pour « Prévenir maintenant »", async () => {
    const swap = (from: string | null, to: string) => [
      { distributionId: jan[3]!, userIds: [admin.id, to, from] },
    ];
    // Avec la case cochée : Fanny ajoutée, Eli retiré → à prévenir maintenant.
    const withNotice = await run(admin.id, (tx, ctx) =>
      savePlanning(tx, ctx, { planId, notify: true, rows: swap(null, people[5]!.id) }, NOW),
    );
    expect(withNotice.status === "saved" && withNotice.notifyNow.sort()).toEqual(
      [people[4]!.id, people[5]!.id].sort(),
    );
    // Sans prévenir : Cyril remplace Fanny → gardés dans la liste.
    const silent = await run(admin.id, (tx, ctx) =>
      savePlanning(tx, ctx, { planId, notify: false, rows: swap(null, people[2]!.id) }, NOW),
    );
    expect(silent.status === "saved" && silent.pending.sort()).toEqual(
      [people[2]!.id, people[5]!.id].sort(),
    );
    const banner = await run(admin.id, (tx, ctx) => getPlanningBanner(tx, ctx, NOW));
    expect(banner.pending).toEqual([
      { planId, names: expect.arrayContaining([expect.stringContaining("Cyril")]) },
    ]);
    // « Prévenir maintenant » : la liste est vidée, Fanny apprend qu'elle n'a plus cette date.
    const notice = await run(admin.id, (tx, ctx) => planChangeNotice(tx, ctx, { planId }, NOW));
    expect(notice.status === "ready" && notice.recipients.map((r) => r.userId).sort()).toEqual(
      [people[2]!.id, people[5]!.id].sort(),
    );
    const [plan] = await db.owner.select().from(dutyPlan).where(eq(dutyPlan.id, planId));
    expect(plan?.pendingNotice).toEqual([]);
  });

  it("calendrier du mois : bénévoles et nombre de permanences du trimestre (G3, accès autorisé)", async () => {
    await db.owner.insert(orderPeriod).values({
      amapId: amapA.id,
      month: "2027-01-01",
      ...periodInstants("2026-12-10", "2026-12-25"),
    });
    const month = await run(admin.id, (tx, ctx) => getMonthDuties(tx, ctx, "2027-01", NOW));
    expect(month.orderPeriod).toEqual({
      opensOn: "2026-12-10",
      closesOn: "2026-12-25",
      status: "open",
    });
    const slots = await slotsOf();
    for (const d of jan) {
      const expected = slots.filter((s) => s.distributionId === d).length;
      expect(month.volunteers[d] ?? []).toHaveLength(expected);
    }
    // Le nombre entre parenthèses est celui du trimestre entier.
    const firstOfAlix = Object.values(month.volunteers)
      .flat()
      .find((v) => v.name.startsWith("Alix"));
    expect(firstOfAlix?.quarterCount).toBe(slots.filter((s) => s.userId === admin.id).length);
  });

  it("calendrier du mois réservé aux admins (G3, accès refusé)", async () => {
    await expect(
      run(people[2]!.id, (tx, ctx) => getMonthDuties(tx, ctx, "2027-01", NOW)),
    ).rejects.toThrow(ForbiddenError);
  });

  it("isole les cases et l'antériorité entre AMAP ; les cases se lisent dans l'AMAP", async () => {
    const member = await run(people[2]!.id, (tx) => tx.select().from(dutySlot));
    expect(member.length).toBeGreaterThan(0);
    const history = await run(people[2]!.id, (tx) => tx.select().from(dutyHistory));
    expect(history).toEqual([]);
    const inB = await run(
      admin.id,
      async (tx) => ({
        slots: await tx.select().from(dutySlot),
        history: await tx.select().from(dutyHistory),
      }),
      amapB.id,
    );
    expect(inB).toEqual({ slots: [], history: [] });
  });
});
