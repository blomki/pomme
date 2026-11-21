import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { auditLog, household, joinRequest, membership } from "@/db/schema";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import {
  acceptJoinRequest,
  countOpenJoinRequests,
  decideJoinRequest,
  listJoinRequests,
  submitJoinRequest,
} from "@/server/join-requests";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

const NOW = new Date("2026-11-21T10:00:00Z");

// Demandes d'adhésion (story B2), avec la vraie base et la RLS.
describe("Demandes d'adhésion (B2)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let adminB: { id: string };

  const as = (
    userId: string | null,
    secondFactorVerified = true,
    amapId = amapA.id,
  ): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified,
  });
  const run = <T>(ctx: AmapContext, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, ctx, fn);
  const submit = (input: { name: string; email: string; phone?: string; message?: string }) =>
    run(as(null), (tx, c) => submitJoinRequest(tx, c, { phone: "", message: "", ...input }));
  const openIds = async () =>
    (await run(as(admin.id), (tx, c) => listJoinRequests(tx, c))).open.map((r) => r.id);

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    referent = await f.createUser();
    adminB = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    await f.grantRole(amapB.id, adminB.id, "admin");
  });

  it("un visiteur envoie une demande ; seuls les admins de l'AMAP la voient", async () => {
    expect(
      await submit({
        name: "Camille Le Goff",
        email: "Camille.LeGoff@example.org",
        phone: "06 12 34 56 78",
        message: "Bonjour, nous aimerions rejoindre l'AMAP.",
      }),
    ).toEqual({ status: "sent" });
    expect(await submit({ name: "", email: "x" })).toEqual({
      status: "invalid",
      problems: ["name", "email"],
    });
    const { open } = await run(as(admin.id), (tx, c) => listJoinRequests(tx, c));
    expect(open).toEqual([
      expect.objectContaining({
        name: "Camille Le Goff",
        email: "camille.legoff@example.org",
        phone: "+33612345678",
        status: "new",
      }),
    ]);
    expect(await run(as(admin.id), (tx, c) => countOpenJoinRequests(tx, c))).toBe(1);
    // Ni le visiteur, ni l'admin d'une autre AMAP ne lisent les demandes.
    expect(await run(as(null), (tx) => tx.select().from(joinRequest))).toEqual([]);
    expect(await run(as(adminB.id, true, amapB.id), (tx, c) => listJoinRequests(tx, c))).toEqual({
      open: [],
      closed: [],
    });
  });

  it("un visiteur ne peut pas écrire autre chose qu'une demande nouvelle", async () => {
    await expect(
      run(as(null), (tx) =>
        tx.insert(joinRequest).values({
          amapId: amapA.id,
          name: "Pirate",
          email: "p@example.org",
          status: "accepted",
        }),
      ),
    ).rejects.toThrow();
  });

  it("l'admin marque la demande contactée, ou la refuse ; journalisé (accès autorisé)", async () => {
    await submit({ name: "Dominique", email: "dominique@example.org" });
    const [first, second] = await openIds();
    expect(
      await run(as(admin.id), (tx, c) =>
        decideJoinRequest(tx, c, { requestId: first, decision: "contacted" }, NOW),
      ),
    ).toEqual({ status: "saved" });
    expect(
      await run(as(admin.id), (tx, c) =>
        decideJoinRequest(tx, c, { requestId: second, decision: "declined" }, NOW),
      ),
    ).toEqual({ status: "saved" });
    // Une demande refusée est close.
    expect(
      await run(as(admin.id), (tx, c) =>
        decideJoinRequest(tx, c, { requestId: second, decision: "contacted" }, NOW),
      ),
    ).toEqual({ status: "closed" });
    const lists = await run(as(admin.id), (tx, c) => listJoinRequests(tx, c));
    expect(lists.open.map((r) => r.status)).toEqual(["contacted"]);
    expect(lists.closed.map((r) => r.status)).toEqual(["declined"]);
    const journal = await db.owner
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityType, "join_request"));
    expect(journal.map((j) => j.action).sort()).toEqual(["decline", "mark_contacted"]);
  });

  it("accepter crée le foyer, son membre et son adhésion, en une fois", async () => {
    const [requestId] = await openIds();
    const accept = (over: Record<string, unknown> = {}) =>
      run(as(admin.id), (tx, c) =>
        acceptJoinRequest(
          tx,
          c,
          {
            requestId,
            householdName: "Foyer Le Goff",
            firstName: "Camille",
            lastName: "Le Goff",
            email: "camille.legoff@example.org",
            phone: "+33612345678",
            startDate: "2026-11-21",
            endDate: "2027-08-31",
            ...over,
          },
          NOW,
        ),
      );
    // Dates d'adhésion à l'envers : rien n'est créé.
    expect(await accept({ startDate: "2027-09-01" })).toMatchObject({ status: "membership" });
    expect(await db.owner.select().from(household).where(eq(household.amapId, amapA.id))).toEqual(
      [],
    );

    const accepted = await accept();
    expect(accepted).toMatchObject({
      status: "accepted",
      invitations: [{ email: "camille.legoff@example.org", firstName: "Camille" }],
    });
    if (accepted.status !== "accepted") return;
    const [created] = await db.owner
      .select()
      .from(household)
      .where(eq(household.id, accepted.householdId));
    expect(created?.name).toBe("Foyer Le Goff");
    const memberships = await db.owner
      .select()
      .from(membership)
      .where(eq(membership.householdId, accepted.householdId));
    expect(memberships).toEqual([
      expect.objectContaining({ startDate: "2026-11-21", endDate: "2027-08-31" }),
    ]);
    const [row] = await db.owner.select().from(joinRequest).where(eq(joinRequest.id, requestId!));
    expect(row).toMatchObject({
      status: "accepted",
      householdId: accepted.householdId,
      handledBy: admin.id,
    });
    expect(await accept()).toEqual({ status: "closed" });
  });

  it("refuse le référent et l'admin sans deuxième vérification (accès refusé)", async () => {
    await expect(run(as(referent.id), (tx, c) => listJoinRequests(tx, c))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      run(as(referent.id), (tx, c) =>
        decideJoinRequest(tx, c, { requestId: "x", decision: "declined" }),
      ),
    ).rejects.toThrow(ForbiddenError);
    await expect(run(as(admin.id, false), (tx, c) => acceptJoinRequest(tx, c, {}))).rejects.toThrow(
      SecondFactorRequiredError,
    );
  });
});
