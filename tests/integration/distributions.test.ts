import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { auditLog, distribution } from "@/db/schema";
import { ForbiddenError } from "@/server/auth/errors";
import {
  generateDistributions,
  getDistributionSettings,
  listDistributions,
  saveDistributionSettings,
  setDistributionOpen,
} from "@/server/distributions";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Calendrier des distributions (story D1), avec la vraie base et la RLS.
describe("Distributions (D1)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let adminB: { id: string };
  let referent: { id: string };

  const as = (userId: string, amapId: string): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const inA = <T>(fn: Parameters<typeof withAmapContext<T>>[2], actor = admin.id) =>
    withAmapContext(db.app, as(actor, amapA.id), fn);

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    adminB = await f.createUser();
    referent = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapB.id, adminB.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  it("refuse de générer tant que la distribution habituelle n'est pas réglée", async () => {
    expect(await inA((tx, ctx) => getDistributionSettings(tx, ctx))).toEqual({
      weekday: null,
      startTime: "",
      endTime: "",
      place: "",
    });
    expect(await inA((tx, ctx) => generateDistributions(tx, ctx, { month: "2026-12" }))).toEqual({
      status: "no_settings",
    });
  });

  it("refuse des horaires incohérents", async () => {
    expect(
      await inA((tx, ctx) =>
        saveDistributionSettings(tx, ctx, { weekday: 9, startTime: "19:30", endTime: "18:00" }),
      ),
    ).toEqual({ status: "invalid", fields: expect.arrayContaining(["weekday", "endTime"]) });
  });

  it("règle la distribution habituelle, puis génère les distributions du mois", async () => {
    expect(
      await inA((tx, ctx) =>
        saveDistributionSettings(tx, ctx, {
          weekday: "2",
          startTime: "18:00",
          endTime: "19:30",
          place: "Salle des fêtes",
        }),
      ),
    ).toEqual({ status: "saved", moved: 0, skipped: [] });
    expect(await inA((tx, ctx) => generateDistributions(tx, ctx, { month: "2026-12" }))).toEqual({
      status: "generated",
      created: 5,
    });
    const list = await inA((tx, ctx) => listDistributions(tx, ctx, "2026-12"));
    expect(list.map((d) => d.date)).toEqual([
      "2026-12-01",
      "2026-12-08",
      "2026-12-15",
      "2026-12-22",
      "2026-12-29",
    ]);
    expect(list[0]).toMatchObject({ startTime: "18:00", endTime: "19:30", isOpen: true });
    const [entry] = await db.owner
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "generate_distributions"));
    expect(entry?.after).toEqual({ month: "2026-12", created: 5 });
  });

  it("ne crée jamais deux distributions à la même date", async () => {
    expect(await inA((tx, ctx) => generateDistributions(tx, ctx, { month: "2026-12" }))).toEqual({
      status: "generated",
      created: 0,
    });
  });

  it("ferme une distribution avec un motif, puis la rouvre", async () => {
    const [last] = (await inA((tx, ctx) => listDistributions(tx, ctx, "2026-12"))).slice(-1);
    const distributionId = last!.id;
    expect(
      await inA((tx, ctx) =>
        setDistributionOpen(tx, ctx, { distributionId, open: false, reason: "  " }),
      ),
    ).toEqual({ status: "reason_required" });
    expect(
      await inA((tx, ctx) =>
        setDistributionOpen(tx, ctx, { distributionId, open: false, reason: "Vacances de Noël" }),
      ),
    ).toEqual({ status: "updated" });
    const closed = await inA((tx, ctx) => listDistributions(tx, ctx, "2026-12"));
    expect(closed.at(-1)).toMatchObject({ isOpen: false, closedReason: "Vacances de Noël" });

    expect(
      await inA((tx, ctx) => setDistributionOpen(tx, ctx, { distributionId, open: true })),
    ).toEqual({ status: "updated" });
    const reopened = await inA((tx, ctx) => listDistributions(tx, ctx, "2026-12"));
    expect(reopened.at(-1)).toMatchObject({ isOpen: true, closedReason: null });
    const actions = await db.owner
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, distributionId));
    expect(actions.map((a) => a.action)).toEqual(["close", "reopen"]);
  });

  it("refuse, au niveau de la base, une distribution fermée sans motif", async () => {
    const [first] = await inA((tx, ctx) => listDistributions(tx, ctx, "2026-12"));
    await expect(
      inA((tx) =>
        tx.update(distribution).set({ isOpen: false }).where(eq(distribution.id, first!.id)),
      ),
    ).rejects.toThrow();
  });

  it("déplace les distributions à venir au nouveau jour habituel, jamais le passé", async () => {
    // Décembre 2026 : mardis 1, 8, 15, 22, 29. On ferme le 22 ; un jeudi 31 existe déjà.
    const before = await inA((tx, ctx) => listDistributions(tx, ctx, "2026-12"));
    const tuesday22 = before.find((d) => d.date === "2026-12-22")!;
    await inA((tx, ctx) =>
      setDistributionOpen(tx, ctx, { distributionId: tuesday22.id, open: false, reason: "Noël" }),
    );
    await db.owner.insert(distribution).values({
      amapId: amapA.id,
      date: "2026-12-31",
      startTime: "18:00",
      endTime: "19:30",
    });

    // Aujourd'hui : mercredi 9 décembre. Passage au jeudi, 17 h 30 – 19 h.
    const result = await inA((tx, ctx) =>
      saveDistributionSettings(
        tx,
        ctx,
        { weekday: 4, startTime: "17:30", endTime: "19:00", moveUpcoming: true },
        "2026-12-09",
      ),
    );
    // 15 → 17, 22 → 24 ; le 31 reste à sa date mais prend les nouveaux horaires ; le 29 ne
    // peut pas aller au 31, déjà pris.
    expect(result).toEqual({ status: "saved", moved: 3, skipped: ["2026-12-29"] });

    const after = await inA((tx, ctx) => listDistributions(tx, ctx, "2026-12"));
    expect(after.map((d) => [d.date, d.startTime, d.isOpen])).toEqual([
      ["2026-12-01", "18:00", true], // passé : intact
      ["2026-12-08", "18:00", true], // passé : intact
      ["2026-12-17", "17:30", true],
      ["2026-12-24", "17:30", false], // reste fermée, avec son motif
      ["2026-12-29", "18:00", true], // le jeudi 31 était déjà pris
      ["2026-12-31", "17:30", true],
    ]);
    expect(after.find((d) => d.date === "2026-12-24")?.closedReason).toBe("Noël");
    const [entry] = await db.owner
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(eq(auditLog.action, "move_distributions"));
    expect(entry?.after).toMatchObject({ weekday: 4, moved: 3, skipped: ["2026-12-29"] });
  });

  it("ne déplace pas une distribution vers un jour déjà passé de la même semaine", async () => {
    // Aujourd'hui : mercredi 16 décembre ; le jeudi 17 repasserait au lundi 14, déjà passé.
    const result = await inA((tx, ctx) =>
      saveDistributionSettings(
        tx,
        ctx,
        { weekday: 1, startTime: "17:30", endTime: "19:00", moveUpcoming: true },
        "2026-12-16",
      ),
    );
    expect(result.status === "saved" && result.skipped).toContain("2026-12-17");
  });

  it("isole les AMAP : l'AMAP B ne voit ni ne ferme les distributions de l'AMAP A", async () => {
    const [first] = await inA((tx, ctx) => listDistributions(tx, ctx, "2026-12"));
    const inB = <T>(fn: Parameters<typeof withAmapContext<T>>[2]) =>
      withAmapContext(db.app, as(adminB.id, amapB.id), fn);
    expect(await inB((tx, ctx) => listDistributions(tx, ctx, "2026-12"))).toEqual([]);
    expect(
      await inB((tx, ctx) =>
        setDistributionOpen(tx, ctx, { distributionId: first!.id, open: false, reason: "Pirate" }),
      ),
    ).toEqual({ status: "not_found" });
  });

  it("réserve le calendrier aux admins", async () => {
    const operations: Array<(tx: never, ctx: AmapContext) => Promise<unknown>> = [
      (tx, ctx) => getDistributionSettings(tx, ctx),
      (tx, ctx) => saveDistributionSettings(tx, ctx, {}),
      (tx, ctx) => listDistributions(tx, ctx, "2026-12"),
      (tx, ctx) => generateDistributions(tx, ctx, { month: "2027-01" }),
      (tx, ctx) => setDistributionOpen(tx, ctx, { distributionId: admin.id, open: true }),
    ];
    for (const operation of operations) {
      await expect(
        inA((tx, ctx) => operation(tx as never, ctx), referent.id),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
