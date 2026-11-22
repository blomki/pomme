import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  distribution,
  dutyPlan,
  dutyResponse,
  household,
  householdMember,
  notificationLog,
  unavailability,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError } from "@/server/auth/errors";
import { runDutyNotices } from "@/server/duty-notices";
import {
  getDutyAdmin,
  getMyAvailability,
  planDutyReminders,
  saveDutyPlan,
  saveMyAvailability,
} from "@/server/duty-plans";
import { createRateLimiter } from "@/server/rate-limit";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Indisponibilités du trimestre (story G1), avec la vraie base et la Row Level Security.
// Trimestre de janvier 2027 ; réponses du 22 novembre au 13 décembre 2026.
const DURING = new Date("2026-11-25T10:00:00Z");
const AFTER = new Date("2026-12-14T10:00:00Z");

describe("Indisponibilités du trimestre (G1)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let camille: { id: string; email: string };
  let dominique: { id: string; email: string };
  let stranger: { id: string };
  let otherMember: { id: string };
  let planId: string;
  let jan: string[];
  let otherDistribution: string;

  const ctxOf = (userId: string, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const run = <T>(userId: string, fn: Parameters<typeof withAmapContext<T>>[2], amapId?: string) =>
    withAmapContext(db.app, ctxOf(userId, amapId), fn);

  const addHousehold = async (amapId: string, name: string, userIds: string[]) => {
    const id = uuidv7();
    await db.owner.insert(household).values({ id, amapId, name });
    await db.owner
      .insert(householdMember)
      .values(
        userIds.map((userId, i) => ({ amapId, householdId: id, userId, isPrimary: i === 0 })),
      );
  };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-g1");
    amapB = await f.createAmap("amap-g1-autre");
    admin = await f.createUser({ firstName: "Alix" });
    camille = await f.createUser({ firstName: "Camille" });
    dominique = await f.createUser({ firstName: "Dominique" });
    stranger = await f.createUser({ firstName: "Personne" });
    otherMember = await f.createUser({ firstName: "Ailleurs" });
    await f.grantRole(amapA.id, admin.id, "admin");
    await addHousehold(amapA.id, "Foyer Alix", [admin.id]);
    // Deux personnes du même foyer : chacune répond pour elle-même.
    await addHousehold(amapA.id, "Foyer Martin", [camille.id, dominique.id]);
    await addHousehold(amapB.id, "Foyer Ailleurs", [otherMember.id]);

    jan = ["2027-01-07", "2027-01-14", "2027-01-21"].map(() => uuidv7());
    otherDistribution = uuidv7();
    await db.owner.insert(distribution).values([
      ...["2027-01-07", "2027-01-14", "2027-01-21"].map((date, i) => ({
        id: jan[i]!,
        amapId: amapA.id,
        date,
        startTime: "18:00",
        endTime: "19:30",
      })),
      // Hors trimestre : décembre.
      {
        id: otherDistribution,
        amapId: amapA.id,
        date: "2026-12-17",
        startTime: "18:00",
        endTime: "19:30",
      },
    ]);
  });

  describe("période de réponse (admin)", () => {
    it("un admin l'enregistre ; les jours sont vérifiés (accès autorisé)", async () => {
      const input = {
        quarterStart: "2027-01-01",
        opensOn: "2026-11-22",
        deadlineOn: "2027-01-02",
        autoReminder: true,
      };
      expect(await run(admin.id, (tx, ctx) => saveDutyPlan(tx, ctx, input))).toEqual({
        status: "too_late",
      });
      const saved = await run(admin.id, (tx, ctx) =>
        saveDutyPlan(tx, ctx, { ...input, deadlineOn: "2026-12-13" }),
      );
      expect(saved.status).toBe("saved");
      planId = saved.status === "saved" ? saved.planId : "";
      const [row] = await db.owner.select().from(dutyPlan).where(eq(dutyPlan.id, planId));
      expect(row).toMatchObject({
        quarterStart: "2027-01-01",
        ...{ opensAt: periodInstants("2026-11-22", "2026-12-13").opensAt },
        unavailabilityDeadline: periodInstants("2026-11-22", "2026-12-13").closesAt,
      });
    });

    it("refuse un amapien sans rôle admin (accès refusé)", async () => {
      await expect(
        run(camille.id, (tx, ctx) =>
          saveDutyPlan(tx, ctx, {
            quarterStart: "2027-01-01",
            opensOn: "2026-11-22",
            deadlineOn: "2026-12-13",
            autoReminder: false,
          }),
        ),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Mes disponibilités (amapien)", () => {
    it("montre les distributions du trimestre seulement, pas encore répondu", async () => {
      const mine = await run(camille.id, (tx, ctx) => getMyAvailability(tx, ctx, DURING));
      expect(mine).toMatchObject({
        status: "ready",
        planId,
        phase: "open",
        deadlineOn: "2026-12-13",
        unavailable: [],
        answeredOn: null,
      });
      if (mine.status === "ready") expect(mine.distributions.map((d) => d.id)).toEqual(jan);
    });

    it("enregistre ses dates, puis rien coché = toujours disponible (accès autorisé)", async () => {
      const save = (ids: string[], userId = camille.id) =>
        run(userId, (tx, ctx) =>
          saveMyAvailability(tx, ctx, { planId, distributionIds: ids }, DURING),
        );
      expect(await save([jan[2]!, jan[0]!])).toEqual({ status: "saved", count: 2 });
      expect(await save([])).toEqual({ status: "saved", count: 0 });
      expect(await save([jan[1]!])).toEqual({ status: "saved", count: 1 });
      // Dominique, même foyer, répond pour elle-même.
      expect(await save([], dominique.id)).toEqual({ status: "saved", count: 0 });
      const mine = await run(camille.id, (tx, ctx) => getMyAvailability(tx, ctx, DURING));
      expect(mine).toMatchObject({ unavailable: [jan[1]], answeredOn: "2026-11-25" });
    });

    it("refuse une date hors du trimestre, après la date limite, ou sans foyer (accès refusé)", async () => {
      expect(
        await run(camille.id, (tx, ctx) =>
          saveMyAvailability(tx, ctx, { planId, distributionIds: [otherDistribution] }, DURING),
        ),
      ).toEqual({ status: "invalid" });
      expect(
        await run(camille.id, (tx, ctx) =>
          saveMyAvailability(tx, ctx, { planId, distributionIds: [] }, AFTER),
        ),
      ).toEqual({ status: "closed" });
      expect(
        await run(stranger.id, (tx, ctx) =>
          saveMyAvailability(tx, ctx, { planId, distributionIds: [] }, DURING),
        ),
      ).toEqual({ status: "no_household" });
      // Après la date limite : lecture seule.
      expect(await run(camille.id, (tx, ctx) => getMyAvailability(tx, ctx, AFTER))).toMatchObject({
        phase: "closed",
        unavailable: [jan[1]],
      });
    });

    it("ne montre pas les dates des autres, sauf aux admins", async () => {
      const seen = await run(dominique.id, (tx) => tx.select().from(unavailability));
      expect(seen).toEqual([]);
      const seenByAdmin = await run(admin.id, (tx) => tx.select().from(unavailability));
      expect(seenByAdmin.map((u) => u.userId)).toEqual([camille.id]);
      // Écrire au nom d'une autre personne : refusé par la base.
      await expect(
        run(dominique.id, (tx) =>
          tx.insert(unavailability).values({
            amapId: amapA.id,
            dutyPlanId: planId,
            userId: camille.id,
            distributionId: jan[0]!,
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("suivi et relances (admin)", () => {
    it("liste les réponses de chaque amapien", async () => {
      const view = await run(admin.id, (tx, ctx) => getDutyAdmin(tx, ctx, DURING));
      expect(view.plan).toMatchObject({ id: planId, phase: "open" });
      expect(view.distributionCount).toBe(3);
      expect(view.rows.map((r) => [r.firstName, r.householdName, r.answeredOn, r.dates])).toEqual([
        ["Alix", "Foyer Alix", null, []],
        ["Camille", "Foyer Martin", "2026-11-25", ["2027-01-14"]],
        ["Dominique", "Foyer Martin", "2026-11-25", []],
      ]);
    });

    it("prépare la relance des personnes sans réponse (accès autorisé), refusée aux autres", async () => {
      const plan = await run(admin.id, (tx, ctx) => planDutyReminders(tx, ctx, { planId }, DURING));
      expect(plan.status === "ready" && plan.recipients.map((r) => r.userId)).toEqual([admin.id]);
      expect(
        await run(admin.id, (tx, ctx) => planDutyReminders(tx, ctx, { planId }, AFTER)),
      ).toEqual({ status: "not_open" });
      await expect(
        run(camille.id, (tx, ctx) => planDutyReminders(tx, ctx, { planId }, DURING)),
      ).rejects.toThrow(ForbiddenError);
    });

    it("tâche horaire : email d'ouverture une fois, relance 3 jours avant aux sans-réponse", async () => {
      const sent: string[] = [];
      const deps = {
        transport: {
          async send(to: string) {
            sent.push(to);
            return { providerId: `<g1-${sent.length}@brevo.test>` };
          },
        },
        recipientLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
        globalLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
      };
      const opening = await runDutyNotices(db.app, DURING, deps);
      expect(opening).toEqual([
        {
          amapId: amapA.id,
          quarterStart: "2027-01-01",
          kind: "opening",
          sent: 3,
          skipped: 0,
          failed: 0,
        },
      ]);
      expect(await runDutyNotices(db.app, DURING, deps)).toEqual([]);
      // Le 10 décembre, 3 jours avant le 13 : seule Alix n'a pas répondu.
      const REMIND = new Date("2026-12-10T10:00:00Z");
      expect(await runDutyNotices(db.app, REMIND, deps)).toEqual([
        {
          amapId: amapA.id,
          quarterStart: "2027-01-01",
          kind: "reminder",
          sent: 1,
          skipped: 0,
          failed: 0,
        },
      ]);
      const [reminded] = await db.owner
        .select()
        .from(dutyResponse)
        .where(and(eq(dutyResponse.dutyPlanId, planId), eq(dutyResponse.userId, admin.id)));
      expect(reminded?.answeredAt).toBeNull();
      expect(reminded?.lastRemindedAt).toEqual(REMIND);
      const templates = await db.owner
        .select({ template: notificationLog.template })
        .from(notificationLog)
        .where(eq(notificationLog.amapId, amapA.id));
      expect(templates.map((t) => t.template).sort()).toEqual([
        "duty_opening",
        "duty_opening",
        "duty_opening",
        "duty_reminder",
      ]);
      // Rien dans l'autre AMAP : pas de planning.
      expect(sent).toHaveLength(4);
    });
  });

  it("isole les plannings, réponses et dates entre AMAP", async () => {
    const fromB = await run(
      otherMember.id,
      async (tx) => ({
        plans: await tx.select().from(dutyPlan),
        responses: await tx.select().from(dutyResponse),
        dates: await tx.select().from(unavailability),
      }),
      amapB.id,
    );
    expect(fromB).toEqual({ plans: [], responses: [], dates: [] });
    // Un admin de A, placé dans le contexte de B, ne voit rien non plus.
    const adminInB = await run(admin.id, (tx) => tx.select().from(dutyResponse), amapB.id);
    expect(adminInB).toEqual([]);
  });
});
