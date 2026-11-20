import { describe, expect, it } from "vitest";

import { handOver, monthSummary, needsFollowUp, paymentState } from "./producer-payments";

const base = { expectedCents: 1200, receivedCents: null, gapSettledAt: null, creditsCents: 0 };
const pending = { ...base, status: "expected" as const };
const received = { ...base, status: "received" as const, receivedCents: 1200 };
const gap = { ...base, status: "received" as const, receivedCents: 1000 };
const settled = { ...gap, gapSettledAt: new Date("2026-12-05T10:00:00Z") };
const handed = { ...received, status: "handed_over" as const };

describe("paymentState", () => {
  it("distingue en attente, écart, reçu et remis", () => {
    expect(paymentState(pending)).toBe("pending");
    expect(paymentState(gap)).toBe("gap");
    expect(paymentState(settled)).toBe("received");
    expect(paymentState(received)).toBe("received");
    expect(paymentState(handed)).toBe("handed_over");
  });
});

describe("needsFollowUp", () => {
  it("garde les chèques en attente et les écarts à régler", () => {
    expect([pending, gap, settled, received, handed].map(needsFollowUp)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("monthSummary", () => {
  it("compte les chèques reçus et additionne les montants et les avoirs", () => {
    expect(
      monthSummary([pending, { ...received, creditsCents: 400, expectedCents: 800 }, handed]),
    ).toEqual({
      total: 3,
      received: 2,
      expectedCents: 3200,
      creditsCents: 400,
      allHandedOver: false,
    });
  });

  it("tous remis seulement si chaque chèque l'est, et jamais pour un mois vide", () => {
    expect(monthSummary([handed, handed]).allHandedOver).toBe(true);
    expect(monthSummary([]).allHandedOver).toBe(false);
  });
});

describe("handOver", () => {
  const today = "2026-11-20";

  it("annonce la remise faite quand tous les chèques sont remis", () => {
    expect(
      handOver({
        allHandedOver: true,
        plannedOn: "2026-12-03",
        lastHandedOverOn: "2026-11-19",
        today,
      }),
    ).toEqual({ kind: "handed", on: "2026-11-19" });
  });

  it("annonce la distribution prévue si elle n'est pas passée (aujourd'hui compris)", () => {
    for (const plannedOn of ["2026-12-03", today]) {
      expect(handOver({ allHandedOver: false, plannedOn, lastHandedOverOn: null, today })).toEqual({
        kind: "planned",
        on: plannedOn,
      });
    }
  });

  it("date inconnue : distribution passée, ou aucune distribution", () => {
    for (const plannedOn of ["2026-11-05", null]) {
      expect(handOver({ allHandedOver: false, plannedOn, lastHandedOverOn: null, today })).toEqual({
        kind: "unknown",
      });
    }
  });
});
