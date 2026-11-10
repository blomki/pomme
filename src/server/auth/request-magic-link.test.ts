import { describe, expect, it, vi } from "vitest";

import type { CaptchaVerdict } from "../captcha";
import { createRateLimiter } from "../rate-limit";

import { requestMagicLink, type RequestMagicLinkDeps } from "./request-magic-link";

function deps(existing: string[] = ["alice@example.org"], captcha: CaptchaVerdict = "passed") {
  const sendLink = vi.fn(async () => {});
  const value: RequestMagicLinkDeps = {
    verifyCaptcha: async () => captcha,
    emailLimiter: createRateLimiter({ limit: 3, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 10, windowMs: 60_000 }),
    userExists: async (email) => existing.includes(email),
    sendLink,
  };
  return { value, sendLink };
}

describe("requestMagicLink", () => {
  it("envoie un lien à un compte existant, adresse normalisée", async () => {
    const { value, sendLink } = deps();
    const result = await requestMagicLink({ email: "  Alice@Example.org ", ip: "1.2.3.4" }, value);
    expect(result).toEqual({ status: "sent" });
    expect(sendLink).toHaveBeenCalledWith("alice@example.org");
  });

  it("répond pareil pour une adresse inconnue, sans rien envoyer", async () => {
    const { value, sendLink } = deps();
    const result = await requestMagicLink({ email: "inconnu@example.org", ip: "1.2.3.4" }, value);
    expect(result).toEqual({ status: "sent" });
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("refuse une adresse mal formée", async () => {
    const { value } = deps();
    expect(await requestMagicLink({ email: "pas-une-adresse", ip: "1.2.3.4" }, value)).toEqual({
      status: "invalid",
    });
    expect(await requestMagicLink({ email: undefined, ip: "1.2.3.4" }, value)).toEqual({
      status: "invalid",
    });
  });

  it("limite les demandes pour une même adresse", async () => {
    const { value, sendLink } = deps();
    for (let i = 0; i < 3; i++) {
      await requestMagicLink({ email: "alice@example.org", ip: `10.0.0.${i}` }, value);
    }
    const result = await requestMagicLink({ email: "alice@example.org", ip: "10.0.0.9" }, value);
    expect(result).toEqual({ status: "rate_limited" });
    expect(sendLink).toHaveBeenCalledTimes(3);
  });

  it("limite les demandes depuis une même adresse IP", async () => {
    const { value } = deps();
    for (let i = 0; i < 10; i++) {
      await requestMagicLink({ email: `p${i}@example.org`, ip: "1.2.3.4" }, value);
    }
    expect(await requestMagicLink({ email: "x@example.org", ip: "1.2.3.4" }, value)).toEqual({
      status: "rate_limited",
    });
  });

  it("refuse sans captcha résolu, avant de toucher aux limites", async () => {
    for (const verdict of ["missing", "rejected"] as const) {
      const { value, sendLink } = deps(["alice@example.org"], verdict);
      const result = await requestMagicLink({ email: "alice@example.org", ip: "1.2.3.4" }, value);
      expect(result).toEqual({ status: "captcha" });
      expect(sendLink).not.toHaveBeenCalled();
      // Le quota de la vraie personne n'a pas été entamé.
      expect(value.emailLimiter.consume("alice@example.org")).toBe(true);
    }
  });
});
