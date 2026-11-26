import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  amapProducer,
  catalog,
  emailCampaign,
  household,
  householdMember,
  membership,
  notificationLog,
  order,
  orderPeriod,
  producer,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { periodInstants } from "@/domain/order-periods";
import { ForbiddenError } from "@/server/auth/errors";
import { listCampaigns, sendCampaign } from "@/server/email/campaigns";
import { getEmailComposer, prepareGroupEmail } from "@/server/group-emails";
import { createRateLimiter } from "@/server/rate-limit";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

// Emails groupés (story H1), avec la vraie base et la Row Level Security.
const NOW = new Date("2026-11-26T10:00:00Z");

describe("Emails groupés (H1)", () => {
  let db: TestDatabase;
  let amapA: { id: string; slug: string; name: string };
  let amapB: { id: string };
  let admin: { id: string; firstName: string };
  let lea: { id: string };
  let paul: { id: string };
  let ancien: { id: string };
  let producerId: string;

  const ctxOf = (userId: string | null, amapId = amapA.id): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified: true,
  });
  const run = <T>(userId: string, fn: Parameters<typeof withAmapContext<T>>[2], amapId?: string) =>
    withAmapContext(db.app, ctxOf(userId, amapId), fn);
  const info = { name: "AMAP H1", slug: "amap-h1", logoUrl: null };

  const addHome = async (name: string, members: string[], member: boolean) => {
    const id = uuidv7();
    await db.owner.insert(household).values({ id, amapId: amapA.id, name });
    await db.owner.insert(householdMember).values(
      members.map((userId, i) => ({
        amapId: amapA.id,
        householdId: id,
        userId,
        isPrimary: i === 0,
      })),
    );
    await db.owner.insert(membership).values({
      amapId: amapA.id,
      householdId: id,
      ...(member
        ? { startDate: "2026-09-01", endDate: "2027-08-31" }
        : { startDate: "2025-09-01", endDate: "2026-08-31" }),
    });
    return id;
  };

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-h1");
    amapB = await f.createAmap("amap-h1-autre");
    admin = await f.createUser({ firstName: "Alix", lastName: "Admin" });
    lea = await f.createUser({ firstName: "Léa" });
    paul = await f.createUser({ firstName: "Paul" });
    ancien = await f.createUser({ firstName: "Ancien" });
    await f.grantRole(amapA.id, admin.id, "admin");
    const martin = await addHome("Foyer Martin", [lea.id, paul.id], true);
    await addHome("Foyer Ancien", [ancien.id], false);
    // Ferme du Pré : le Foyer Martin lui a commandé en octobre ; personne d'autre.
    producerId = uuidv7();
    await db.owner
      .insert(producer)
      .values({ id: producerId, name: "Ferme du Pré", category: "Légumes" });
    await db.owner.insert(amapProducer).values({ amapId: amapA.id, producerId });
    const catalogId = uuidv7();
    await db.owner.insert(catalog).values({
      id: catalogId,
      amapId: amapA.id,
      producerId,
      month: "2026-10-01",
      status: "published",
    });
    await db.owner.insert(order).values({ amapId: amapA.id, householdId: martin, catalogId });
  });

  it("propose les destinataires : adhérents actifs, clients d'un producteur (accès autorisé)", async () => {
    const view = await run(admin.id, (tx, ctx) => getEmailComposer(tx, ctx, info, NOW));
    // L'adhésion du Foyer Ancien est terminée : il n'est pas adhérent.
    expect(view.members.map((m) => m.firstName)).toEqual(["Léa", "Paul"]);
    expect(view.producers).toMatchObject([
      {
        name: "Ferme du Pré",
        category: "Légumes",
        recipients: [{ firstName: "Léa" }, { firstName: "Paul" }],
      },
    ]);
    // Pas encore de période de commande : pas de valeur pour ces balises.
    expect(view.dateValues.debutPeriodeCommande).toBeUndefined();
  });

  it("refuse un non-admin (accès refusé)", async () => {
    await expect(run(lea.id, (tx, ctx) => getEmailComposer(tx, ctx, info, NOW))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      run(lea.id, (tx, ctx) =>
        prepareGroupEmail(tx, ctx, { audience: "all_members", subject: "x", body: "" }, NOW),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("bloque sans objet, avec une période manquante ou {{producteur}} hors sujet", async () => {
    const prepare = (input: Record<string, unknown>) =>
      run(admin.id, (tx, ctx) => prepareGroupEmail(tx, ctx, input, NOW));
    expect(await prepare({ audience: "all_members", subject: " ", body: "" })).toEqual({
      status: "no_subject",
    });
    expect(
      await prepare({
        audience: "all_members",
        subject: "Commandes",
        body: "Avant le {{finPeriodeCommande}}",
      }),
    ).toEqual({ status: "blocked" });
    expect(
      await prepare({ audience: "all_members", subject: "Infos {{producteur}}", body: "" }),
    ).toEqual({ status: "blocked" });
    // Une fois la période de commande définie, l'envoi est possible et les dates sont remplies.
    await db.owner.insert(orderPeriod).values({
      amapId: amapA.id,
      month: "2026-12-01",
      ...periodInstants("2026-11-15", "2026-11-30"),
      status: "open",
    });
    const ready = await prepare({
      audience: "producer_customers",
      producerId,
      subject: "Infos {{producteur}}",
      body: "Avant le {{finPeriodeCommande}}",
    });
    expect(ready).toMatchObject({
      status: "ready",
      householdCount: 1,
      values: { producteur: "Ferme du Pré", finPeriodeCommande: "lundi 30 novembre" },
    });
    if (ready.status === "ready") expect(ready.recipients).toHaveLength(2);
  });

  it("inscrit chaque envoi dans l'historique, avec l'auteur et les adresses en échec", async () => {
    let calls = 0;
    const deps = {
      transport: {
        async send() {
          calls += 1;
          if (calls === 2) throw new Error("boîte pleine");
          return { providerId: `<h1-${calls}@brevo.test>` };
        },
      },
      recipientLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
      globalLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    };
    const notification = (to: string, userId: string) => ({
      amapId: amapA.id,
      userId,
      template: "group_email" as const,
      to,
      content: { subject: "Bonjour", html: "<p>Bonjour</p>", text: "Bonjour" },
    });
    const result = await sendCampaign(
      db.app,
      ctxOf(admin.id),
      {
        audience: "all_members",
        subject: "Bonjour",
        body: "Bonjour {{prenom}}",
        sentBy: admin.id,
        automatic: false,
        householdCount: 1,
      },
      [notification("lea@example.org", lea.id), notification("paul@example.org", paul.id)],
      deps,
    );
    expect(result).toMatchObject({ sent: 1, failed: 1 });
    const logs = await db.owner
      .select({ campaignId: notificationLog.campaignId, status: notificationLog.status })
      .from(notificationLog)
      .where(eq(notificationLog.campaignId, result.campaignId!));
    expect(logs.map((l) => l.status).sort()).toEqual(["failed", "sent"]);

    // Envoi automatique, au nom de qui l'a programmé.
    await sendCampaign(
      db.app,
      { amapId: amapA.id, userId: null, trusted: "closing_job" },
      {
        audience: "households_without_order",
        subject: "Rappel",
        sentBy: admin.id,
        automatic: true,
      },
      [notification("lea@example.org", lea.id)],
      deps,
    );
    const history = await run(admin.id, (tx) => listCampaigns(tx));
    expect(
      history.map((h) => [
        h.subject,
        h.audience,
        h.recipientCount,
        h.author,
        h.automatic,
        h.failed,
      ]),
    ).toEqual([
      ["Rappel", "households_without_order", 1, "Alix Admin", true, 0],
      ["Bonjour", "all_members", 2, "Alix Admin", false, 1],
    ]);
  });

  it("réserve l'historique aux admins et l'isole entre AMAP", async () => {
    expect(await run(lea.id, (tx) => tx.select().from(emailCampaign))).toEqual([]);
    expect(await run(admin.id, (tx) => tx.select().from(emailCampaign), amapB.id)).toEqual([]);
  });
});
