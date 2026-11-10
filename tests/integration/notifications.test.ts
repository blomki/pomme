import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { withAmapContext } from "@/db/context";
import { notificationLog } from "@/db/schema";
import { dedupeKey } from "@/domain/notifications";
import type { EmailTransport } from "@/server/email/mailer";
import { sendNotification, type Notification, type NotifyDeps } from "@/server/email/notify";
import { createRateLimiter } from "@/server/rate-limit";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

/** Faux transport : garde les emails au lieu de les envoyer, ou simule une panne. */
function fakeTransport() {
  const sent: string[] = [];
  let failing = false;
  const transport: EmailTransport = {
    async send(to) {
      if (failing) throw new Error("SMTP indisponible");
      sent.push(to);
      return { providerId: `<message-${sent.length}@brevo.test>` };
    },
  };
  return { sent, transport, fail: (value: boolean) => (failing = value) };
}

// Journal des emails (fiche S5) : traces, dédoublonnage, limitation, isolation entre AMAP.
describe("Envoi des emails et journal", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let alice: { id: string; email: string };
  let fake: ReturnType<typeof fakeTransport>;
  let deps: NotifyDeps;

  const email = (overrides: Partial<Notification> = {}): Notification => ({
    amapId: amapA.id,
    userId: alice.id,
    template: "magic_link",
    to: alice.email,
    content: { subject: "Objet", text: "Texte", html: "<p>Texte</p>" },
    ...overrides,
  });

  /** Envoi d'un email d'AMAP, comme l'application : dans le contexte de l'AMAP. */
  const sendInAmap = (notification: Notification, amapId = amapA.id) =>
    withAmapContext(db.app, { amapId, userId: null }, (tx) =>
      sendNotification(tx, notification, deps),
    );

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    alice = await f.createUser({ email: "alice@example.org" });
  });

  beforeEach(() => {
    fake = fakeTransport();
    deps = {
      transport: fake.transport,
      recipientLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
      globalLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    };
  });

  afterAll(async () => {
    await db?.stop();
  });

  it("envoie l'email et le trace, avec l'identifiant du fournisseur", async () => {
    const result = await sendInAmap(email());
    expect(result.status).toBe("sent");
    const [row] = await db.owner
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.id, result.logId ?? ""));
    expect(row).toMatchObject({
      amapId: amapA.id,
      userId: alice.id,
      template: "magic_link",
      status: "sent",
      providerId: "<message-1@brevo.test>",
    });
    expect(row?.sentAt).toBeInstanceOf(Date);
  });

  it("n'envoie jamais deux fois une relance pour la même occasion", async () => {
    const key = dedupeKey("order_reminder", alice.id, "periode-1");
    const first = await sendInAmap(email({ dedupeKey: key }));
    const second = await sendInAmap(email({ dedupeKey: key }));
    expect(first.status).toBe("sent");
    expect(second.status).toBe("duplicate");
    expect(fake.sent).toHaveLength(1);

    // Une autre occasion, ou la même dans une autre AMAP, part normalement.
    expect(
      (await sendInAmap(email({ dedupeKey: dedupeKey("order_reminder", alice.id, "periode-2") })))
        .status,
    ).toBe("sent");
    expect((await sendInAmap(email({ amapId: amapB.id, dedupeKey: key }), amapB.id)).status).toBe(
      "sent",
    );
  });

  it("n'envoie qu'une fois, même si deux envois partent en même temps", async () => {
    const key = dedupeKey("order_reminder", alice.id, "simultane");
    const results = await Promise.all([
      sendInAmap(email({ dedupeKey: key })),
      sendInAmap(email({ dedupeKey: key })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["duplicate", "sent"]);
    expect(fake.sent).toHaveLength(1);
  });

  it("trace un échec, et permet alors un nouvel essai", async () => {
    const key = dedupeKey("order_reminder", alice.id, "panne");
    fake.fail(true);
    const failed = await sendInAmap(email({ dedupeKey: key }));
    expect(failed.status).toBe("failed");
    const [row] = await db.owner
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.id, failed.logId ?? ""));
    expect(row?.error).toContain("SMTP indisponible");

    fake.fail(false);
    expect((await sendInAmap(email({ dedupeKey: key }))).status).toBe("sent");
  });

  it("n'envoie pas au-delà de la limite de débit, et le trace", async () => {
    deps.recipientLimiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    await sendInAmap(email());
    await sendInAmap(email());
    const limited = await sendInAmap(email());
    expect(limited.status).toBe("rate_limited");
    expect(fake.sent).toHaveLength(2);
  });

  it("trace les emails de la plateforme avec le rôle de Better Auth", async () => {
    const result = await sendNotification(db.auth, email({ amapId: null }), deps);
    expect(result.status).toBe("sent");
    // Le rôle de Better Auth ne voit que les emails de la plateforme.
    const visible = await db.auth.select().from(notificationLog);
    expect(visible.every((row) => row.amapId === null)).toBe(true);
  });

  it("isole le journal entre AMAP et le cache sans contexte", async () => {
    await sendInAmap(email({ amapId: amapB.id }), amapB.id);
    const seenFromA = await withAmapContext(db.app, { amapId: amapA.id, userId: null }, (tx) =>
      tx.select().from(notificationLog),
    );
    expect(seenFromA.length).toBeGreaterThan(0);
    expect(seenFromA.every((row) => row.amapId === amapA.id)).toBe(true);
    expect(await db.app.select().from(notificationLog)).toEqual([]);
    // L'application ne peut pas écrire un email au nom d'une autre AMAP.
    await expect(
      withAmapContext(db.app, { amapId: amapA.id, userId: null }, (tx) =>
        sendNotification(tx, email({ amapId: amapB.id }), deps),
      ),
    ).rejects.toThrow();
  });
});
