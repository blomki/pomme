import { afterEach, describe, expect, it, vi } from "vitest";

import { captchaConfig, verifyCaptcha, type CaptchaConfig } from "./captcha";

const config: CaptchaConfig = { sitekey: "FCtest", apiKey: "cle-api", endpoint: "eu" };

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("captchaConfig", () => {
  it("lit les clés et le point d'accès", () => {
    expect(
      captchaConfig({
        FRIENDLY_CAPTCHA_SITEKEY: "FC1",
        FRIENDLY_CAPTCHA_API_KEY: "k",
        FRIENDLY_CAPTCHA_ENDPOINT: "eu",
      }),
    ).toEqual({ sitekey: "FC1", apiKey: "k", endpoint: "eu" });
    expect(
      captchaConfig({ FRIENDLY_CAPTCHA_SITEKEY: "FC1", FRIENDLY_CAPTCHA_API_KEY: "k" })?.endpoint,
    ).toBe("global");
  });

  it("est désactivé sans clés en développement", () => {
    expect(captchaConfig({ NODE_ENV: "development" })).toBeNull();
  });

  it("refuse de démarrer sans clés en production", () => {
    expect(() => captchaConfig({ NODE_ENV: "production" })).toThrow(/obligatoires/);
  });

  it("peut être désactivé explicitement (CI)", () => {
    expect(captchaConfig({ NODE_ENV: "production", CAPTCHA_DISABLED: "1" })).toBeNull();
  });
});

describe("verifyCaptcha", () => {
  afterEach(() => vi.restoreAllMocks());

  it("laisse passer quand le captcha est désactivé", async () => {
    expect(await verifyCaptcha(undefined, null)).toBe("passed");
  });

  it("signale une réponse absente sans appeler l'API", async () => {
    const fetchFn = reply(200, { success: true });
    expect(await verifyCaptcha("", config, fetchFn)).toBe("missing");
    expect(await verifyCaptcha(null, config, fetchFn)).toBe("missing");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("envoie la réponse et la clé au point d'accès choisi", async () => {
    const fetchFn = reply(200, { success: true });
    expect(await verifyCaptcha("reponse", config, fetchFn)).toBe("passed");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://eu.frcapi.com/api/v2/captcha/siteverify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-Key": "cle-api" }),
        body: JSON.stringify({ response: "reponse", sitekey: "FCtest" }),
      }),
    );
  });

  it("refuse une réponse rejetée par Friendly Captcha", async () => {
    expect(await verifyCaptcha("fausse", config, reply(200, { success: false }))).toBe("rejected");
  });

  it("accepte si Friendly Captcha est en panne ou injoignable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyCaptcha("r", config, reply(503, {}))).toBe("passed");
    const down = vi.fn(async () => {
      throw new Error("réseau");
    });
    expect(await verifyCaptcha("r", config, down)).toBe("passed");
  });
});
