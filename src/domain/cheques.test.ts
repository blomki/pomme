import { describe, expect, it } from "vitest";

import {
  chequeGap,
  cleanChequeNumber,
  hasOpenGap,
  matchesFilter,
  MAX_CHEQUE_NUMBER_LENGTH,
  parseReceivedCents,
  pointageProgress,
  type PointedCheque,
} from "./cheques";

const cheque = (overrides: Partial<PointedCheque> = {}): PointedCheque => ({
  status: "expected",
  expectedCents: 1200,
  receivedCents: null,
  gapSettledAt: null,
  ...overrides,
});
const received = (receivedCents: number, gapSettledAt: Date | null = null) =>
  cheque({ status: "received", receivedCents, gapSettledAt });

describe("chequeGap et hasOpenGap", () => {
  it("n'a pas d'écart tant que le chèque n'est pas reçu", () => {
    expect(chequeGap(cheque())).toBeNull();
    expect(hasOpenGap(cheque())).toBe(false);
  });

  it("calcule reçu − attendu, négatif quand il manque de l'argent", () => {
    expect(chequeGap(received(1200))).toBe(0);
    expect(chequeGap(received(1000))).toBe(-200);
    expect(chequeGap(received(1500))).toBe(300);
    expect(chequeGap(cheque({ status: "handed_over", receivedCents: 1100 }))).toBe(-100);
  });

  it("signale l'écart jusqu'à ce que le référent le traite", () => {
    expect(hasOpenGap(received(1200))).toBe(false);
    expect(hasOpenGap(received(1000))).toBe(true);
    expect(hasOpenGap(received(1000, new Date()))).toBe(false);
  });
});

describe("matchesFilter", () => {
  const all = [cheque(), received(1200), received(1000), received(1000, new Date())];
  it("filtre Tous, Non reçus, Écarts", () => {
    expect(all.filter((c) => matchesFilter(c, "all"))).toHaveLength(4);
    expect(all.filter((c) => matchesFilter(c, "pending"))).toEqual([all[0]]);
    expect(all.filter((c) => matchesFilter(c, "gaps"))).toEqual([all[2]]);
  });
});

describe("pointageProgress", () => {
  it("compte les chèques traités (reçus ou remis) sur le total", () => {
    expect(
      pointageProgress([
        cheque(),
        received(1200),
        cheque({ status: "handed_over", receivedCents: 1 }),
      ]),
    ).toEqual({ treated: 2, total: 3 });
    expect(pointageProgress([])).toEqual({ treated: 0, total: 0 });
  });
});

describe("parseReceivedCents et cleanChequeNumber", () => {
  it("lit un montant en euros", () => {
    expect(parseReceivedCents("12,50")).toBe(1250);
    expect(parseReceivedCents("12")).toBe(1200);
    expect(parseReceivedCents("0")).toBeNull();
    expect(parseReceivedCents("abc")).toBeNull();
  });

  it("nettoie le numéro, facultatif et de longueur limitée", () => {
    expect(cleanChequeNumber(" 1234  567 ")).toBe("1234 567");
    expect(cleanChequeNumber("  ")).toBeNull();
    expect(cleanChequeNumber("9".repeat(MAX_CHEQUE_NUMBER_LENGTH + 1))).toBeUndefined();
  });
});
