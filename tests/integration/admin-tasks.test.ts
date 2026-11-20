import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import {
  adminTask,
  amapProducer,
  catalog,
  catalogItem,
  distribution,
  household,
  householdMember,
  membership,
  order,
  orderLine,
  producer,
  product,
} from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { getMembershipProgress, listFollowUpTasks, markTaskDone } from "@/server/admin-tasks";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import { setDistributionOpen } from "@/server/distributions";
import { createAdminReport } from "@/server/reports";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

const NOW = new Date("2026-12-11T10:00:00Z");

// Liste de tâches du tableau de bord admin (story H3), avec la vraie base et la RLS.
describe("Tâches « À suivre » (H3)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string; firstName: string };
  let adminB: { id: string };
  let referent: { id: string };
  let family: { id: string };
  let dec24: string;
  let decLine: string;

  const as = (userId: string, amapId = amapA.id, secondFactorVerified = true): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified,
  });
  const run = <T>(ctx: AmapContext, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, ctx, fn);
  const tasksOf = (ctx: AmapContext) => run(ctx, (tx, c) => listFollowUpTasks(tx, c));

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser({ firstName: "Camille" });
    adminB = await f.createUser();
    referent = await f.createUser();
    family = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapB.id, adminB.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");

    const [martin, dubois, petit] = [uuidv7(), uuidv7(), uuidv7()];
    await db.owner.insert(household).values([
      { id: martin, amapId: amapA.id, name: "Foyer Martin" },
      { id: dubois, amapId: amapA.id, name: "Foyer Dubois" },
      { id: petit, amapId: amapA.id, name: "Foyer Petit" },
    ]);
    await db.owner
      .insert(householdMember)
      .values({ amapId: amapA.id, householdId: martin, userId: family.id, isPrimary: true });
    // Adhésions : Martin adhérent jusqu'en juin, Dubois jusqu'au 31 décembre (expire bientôt),
    // Petit sans adhésion.
    await db.owner.insert(membership).values([
      { amapId: amapA.id, householdId: martin, startDate: "2026-07-01", endDate: "2027-06-30" },
      { amapId: amapA.id, householdId: dubois, startDate: "2026-01-01", endDate: "2026-12-31" },
    ]);

    const dec3 = uuidv7();
    dec24 = uuidv7();
    await db.owner.insert(distribution).values([
      { id: dec3, amapId: amapA.id, date: "2026-12-03", startTime: "18:00", endTime: "19:30" },
      { id: dec24, amapId: amapA.id, date: "2026-12-24", startTime: "18:00", endTime: "19:30" },
    ]);
    const [farmProducer, farm, eggs, decCatalog, eggsDec, decOrder] = Array.from(
      { length: 6 },
      () => uuidv7(),
    ) as [string, string, string, string, string, string];
    await db.owner.insert(producer).values({ id: farmProducer, name: "Ferme d'essai" });
    await db.owner
      .insert(amapProducer)
      .values({ id: farm, amapId: amapA.id, producerId: farmProducer });
    await db.owner
      .insert(product)
      .values({ id: eggs, producerId: farmProducer, name: "Œufs, boîte de 6" });
    await db.owner.insert(catalog).values({
      id: decCatalog,
      amapId: amapA.id,
      producerId: farmProducer,
      month: "2026-12-01",
      status: "published",
    });
    await db.owner.insert(catalogItem).values({
      id: eggsDec,
      amapId: amapA.id,
      catalogId: decCatalog,
      productId: eggs,
      priceCents: 350,
    });
    await db.owner
      .insert(order)
      .values({ id: decOrder, amapId: amapA.id, householdId: martin, catalogId: decCatalog });
    decLine = uuidv7();
    await db.owner.insert(orderLine).values({
      id: decLine,
      amapId: amapA.id,
      orderId: decOrder,
      catalogItemId: eggsDec,
      distributionId: dec3,
      quantity: 2,
      unitPriceCents: 350,
    });
  });

  it("fermer une distribution crée la tâche ; la rouvrir la retire ; sans doublon", async () => {
    const close = () =>
      run(as(admin.id), (tx, c) =>
        setDistributionOpen(tx, c, { distributionId: dec24, open: false, reason: "Noël" }),
      );
    expect(await close()).toEqual({ status: "updated" });
    let tasks = await tasksOf(as(admin.id));
    expect(tasks.todo).toEqual([
      expect.objectContaining({
        kind: "distribution_closed",
        relatedId: dec24,
        details: { date: "2026-12-24", reason: "Noël" },
        dueDate: "2026-12-24",
      }),
    ]);

    // Rouverte : la tâche n'a plus lieu d'être. Refermée : une seule tâche, de nouveau à faire.
    await run(as(admin.id), (tx, c) =>
      setDistributionOpen(tx, c, { distributionId: dec24, open: true }),
    );
    expect((await tasksOf(as(admin.id))).todo).toEqual([]);
    await close();
    await close();
    tasks = await tasksOf(as(admin.id));
    expect(tasks.todo).toHaveLength(1);
    const rows = await db.owner.select().from(adminTask).where(eq(adminTask.relatedId, dec24));
    expect(rows).toHaveLength(1);
  });

  it("un signalement reporté de la feuille d'émargement crée une tâche « À rappeler »", async () => {
    const created = await run(as(admin.id), (tx, c) =>
      createAdminReport(
        tx,
        c,
        { orderLineId: decLine, quantity: 1, reason: "missing", comment: "" },
        NOW,
      ),
    );
    expect(created).toMatchObject({ status: "created" });
    const { todo } = await tasksOf(as(admin.id));
    expect(todo.map((t) => t.kind)).toEqual(["distribution_closed", "report_follow_up"]);
    expect(todo[1]).toMatchObject({
      details: {
        distributionDate: "2026-12-03",
        producer: "Ferme d'essai",
        product: "Œufs, boîte de 6",
        quantity: 1,
      },
    });
  });

  it("l'admin coche « Fait », puis rétablit (accès autorisé)", async () => {
    const [first] = (await tasksOf(as(admin.id))).todo;
    const mark = (done: boolean) =>
      run(as(admin.id), (tx, c) => markTaskDone(tx, c, { taskId: first!.id, done }, NOW));
    expect(await mark(true)).toEqual({ status: "saved" });
    let tasks = await tasksOf(as(admin.id));
    expect(tasks.todo).toHaveLength(1);
    expect(tasks.done).toEqual([
      expect.objectContaining({ id: first!.id, doneAt: NOW, doneByName: "Camille" }),
    ]);
    expect(await mark(false)).toEqual({ status: "saved" });
    tasks = await tasksOf(as(admin.id));
    expect(tasks.todo).toHaveLength(2);
    expect(tasks.done).toEqual([]);
    expect(
      await run(as(admin.id), (tx, c) => markTaskDone(tx, c, { taskId: "pas-un-id", done: true })),
    ).toEqual({ status: "invalid" });
  });

  it("refuse les autres comptes et les autres AMAP (accès refusé)", async () => {
    const [first] = (await tasksOf(as(admin.id))).todo;
    for (const user of [referent, family]) {
      await expect(tasksOf(as(user.id))).rejects.toThrow(ForbiddenError);
      await expect(
        run(as(user.id), (tx, c) => markTaskDone(tx, c, { taskId: first!.id, done: true })),
      ).rejects.toThrow(ForbiddenError);
    }
    await expect(tasksOf(as(admin.id, amapA.id, false))).rejects.toThrow(SecondFactorRequiredError);
    // L'admin d'une autre AMAP ne voit ni ne coche les tâches de celle-ci.
    expect(await tasksOf(as(adminB.id, amapB.id))).toEqual({ todo: [], done: [] });
    expect(
      await run(as(adminB.id, amapB.id), (tx, c) =>
        markTaskDone(tx, c, { taskId: first!.id, done: true }),
      ),
    ).toEqual({ status: "not_found" });
    // Ni la famille ni le référent n'écrivent de tâche directement dans la base.
    await expect(
      run(as(referent.id), (tx) =>
        tx.insert(adminTask).values({
          amapId: amapA.id,
          kind: "distribution_closed",
          relatedId: uuidv7(),
        }),
      ),
    ).rejects.toThrow();
  });

  it("avancement des adhésions : adhérents, dont ceux qui expirent bientôt", async () => {
    expect(await run(as(admin.id), (tx, c) => getMembershipProgress(tx, c, NOW))).toEqual({
      active: 2,
      expiring: 1,
      total: 3,
    });
    await expect(run(as(family.id), (tx, c) => getMembershipProgress(tx, c, NOW))).rejects.toThrow(
      ForbiddenError,
    );
  });
});
