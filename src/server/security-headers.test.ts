import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createNonce, SECURITY_HEADERS } from "./security-headers";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("contentSecurityPolicy", () => {
  it("n'autorise que les scripts qui portent le nonce de la page", () => {
    const csp = contentSecurityPolicy({ nonce: "abc", isDev: false });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("autorise eval en développement seulement", () => {
    expect(contentSecurityPolicy({ nonce: "abc", isDev: true })).toContain("'unsafe-eval'");
  });

  it("interdit l'affichage dans un cadre et les plugins", () => {
    const csp = contentSecurityPolicy({ nonce: "abc", isDev: false });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("ouvre seulement Friendly Captcha vers l'extérieur", () => {
    const csp = contentSecurityPolicy({ nonce: "abc", isDev: false });
    expect(directive(csp, "frame-src")).toBe("frame-src https://*.frcapi.com");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://*.frcapi.com");
  });

  it("autorise le serveur de Sentry quand il est configuré", () => {
    const csp = contentSecurityPolicy({
      nonce: "abc",
      isDev: false,
      errorReportOrigin: "https://o1.ingest.de.sentry.io",
    });
    expect(directive(csp, "connect-src")).toBe(
      "connect-src 'self' https://*.frcapi.com https://o1.ingest.de.sentry.io",
    );
  });

  it("autorise le stockage des images déposées quand il est configuré (S11)", () => {
    expect(directive(contentSecurityPolicy({ nonce: "abc", isDev: false }), "img-src")).toBe(
      "img-src 'self' data: blob:",
    );
    const csp = contentSecurityPolicy({
      nonce: "abc",
      isDev: false,
      imageOrigin: "https://cellar-c2.services.clever-cloud.com",
    });
    expect(directive(csp, "img-src")).toBe(
      "img-src 'self' data: blob: https://cellar-c2.services.clever-cloud.com",
    );
  });

  it("ne met pas de nonce dans style-src (il ferait ignorer 'unsafe-inline')", () => {
    const csp = contentSecurityPolicy({ nonce: "abc", isDev: false });
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
  });
});

describe("createNonce", () => {
  it("tire un nonce différent à chaque appel", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("SECURITY_HEADERS", () => {
  it("contient les en-têtes du cahier technique", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
  });
});
