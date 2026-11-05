import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("accepte jusqu'à la limite puis refuse", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.consume("a", 0)).toBe(true);
    expect(limiter.consume("a", 10)).toBe(true);
    expect(limiter.consume("a", 20)).toBe(false);
  });

  it("compte chaque clé séparément", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.consume("a", 0)).toBe(true);
    expect(limiter.consume("b", 0)).toBe(true);
  });

  it("accepte de nouveau une fois la fenêtre passée", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.consume("a", 0)).toBe(true);
    expect(limiter.consume("a", 999)).toBe(false);
    expect(limiter.consume("a", 1000)).toBe(true);
  });
});
