import { expect, test, type Page } from "@playwright/test";

// En-têtes de sécurité et Content-Security-Policy (ADR 0008). Si la CSP bloquait un script de
// Next.js ou de MUI, la page s'afficherait mais ne réagirait plus : on vérifie donc aussi
// qu'aucune violation n'est signalée par le navigateur. Les boutons qui demandent du JavaScript
// (mode sombre, passkeys) sont testés dans theme.spec.ts et auth.spec.ts, avec la même CSP.

/** Note chaque contenu bloqué par la CSP, dès le chargement de la page. */
async function recordCspViolations(page: Page) {
  await page.addInitScript(() => {
    const store: string[] = [];
    Object.assign(window, { __cspViolations: store });
    document.addEventListener("securitypolicyviolation", (event) => {
      store.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

test("les pages portent les en-têtes de sécurité et une CSP avec nonce", async ({ page }) => {
  const response = await page.goto("/connexion");
  const headers = response?.headers() ?? {};
  const csp = headers["content-security-policy"] ?? "";

  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();

  // Un nonce neuf à chaque page.
  const again = await page.goto("/connexion");
  expect(again?.headers()["content-security-policy"]).not.toBe(csp);
});

for (const path of ["/", "/connexion", "/hommesdeterre", "/hommesdeterre/famille", "/producteur"]) {
  test(`la CSP ne bloque rien sur ${path}`, async ({ page }) => {
    const violations = await recordCspViolations(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
  });
}

test("la sonde de santé répond quand la base est joignable", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["strict-transport-security"]).toContain("max-age=");
});
