import { describe, expect, it, vi } from "vitest";

import { createRateLimiter } from "../rate-limit";

import { verifySecondFactor, type VerifySecondFactorDeps } from "./verify-second-factor";

function deps(overrides: Partial<VerifySecondFactorDeps> = {}) {
  const value: VerifySecondFactorDeps = {
    limiter: createRateLimiter({ limit: 5, windowMs: 60_000 }),
    userId: "u1",
    verifyTotp: vi.fn(async (code: string) => code === "123456"),
    verifyBackupCode: vi.fn(async (code: string) => code === "aBcDe-12345"),
    markVerified: vi.fn(async () => {}),
    ...overrides,
  };
  return value;
}

describe("verifySecondFactor", () => {
  it("note la vérification quand le code de l'application est juste", async () => {
    const d = deps();
    const state = await verifySecondFactor({ method: "totp", code: "123 456" }, d);
    expect(state.status).toBe("verified");
    expect(d.verifyTotp).toHaveBeenCalledWith("123456");
    expect(d.markVerified).toHaveBeenCalledOnce();
  });

  it("accepte un code de secours", async () => {
    const d = deps();
    const state = await verifySecondFactor({ method: "backup", code: "aBcDe12345" }, d);
    expect(state.status).toBe("verified");
    expect(d.verifyBackupCode).toHaveBeenCalledWith("aBcDe-12345");
  });

  it("refuse un code faux sans rien noter", async () => {
    const d = deps();
    const state = await verifySecondFactor({ method: "totp", code: "000000" }, d);
    expect(state.status).toBe("wrong_code");
    expect(d.markVerified).not.toHaveBeenCalled();
  });

  it("refuse un format inattendu sans appeler Better Auth", async () => {
    const d = deps();
    expect((await verifySecondFactor({ method: "totp", code: "12ab" }, d)).status).toBe(
      "invalid_format",
    );
    expect((await verifySecondFactor({ method: "sms", code: "123456" }, d)).status).toBe(
      "invalid_format",
    );
    expect(d.verifyTotp).not.toHaveBeenCalled();
  });

  it("bloque après 5 essais pour le même compte", async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) await verifySecondFactor({ method: "totp", code: "000000" }, d);
    const state = await verifySecondFactor({ method: "totp", code: "123456" }, d);
    expect(state.status).toBe("rate_limited");
    expect(d.verifyTotp).toHaveBeenCalledTimes(5);
  });
});
