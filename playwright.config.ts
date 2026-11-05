import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

/**
 * Tests dans de vrais navigateurs (Playwright).
 * - chromium : ordinateur (parcours référent et administrateur) ;
 * - webkit-mobile : iPhone, moteur de Safari (parcours famille et producteur) ;
 * - visual : captures d'écran comparées à des images de référence. Lancé en CI seulement :
 *   les polices et le rendu varient d'une machine à l'autre (voir ADR 0002).
 */
export default defineConfig({
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },
  // Images de référence rangées à côté des tests visuels, sans le nom du système d'exploitation :
  // elles sont toujours produites dans le même environnement (CI, Ubuntu).
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  projects: [
    { name: "chromium", testDir: "./tests/e2e", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-mobile", testDir: "./tests/e2e", use: { ...devices["iPhone 13"] } },
    { name: "visual", testDir: "./tests/visual", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // En CI, on teste le build de production ; en local, le serveur de développement.
    command: isCI ? "pnpm start" : "pnpm dev",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
