import { expect, test } from "@playwright/test";

// Captures des écrans clés, en thème clair et sombre, comparées aux images de référence
// de tests/visual/__screenshots__/. Un écart de plus de 1 % des pixels fait échouer le test :
// on regarde alors la différence dans le rapport Playwright, puis on corrige le code ou on
// met à jour les références (étiquette « captures » sur la PR, voir README).
const screens = [
  { name: "accueil", path: "/", viewport: "mobile" },
  { name: "amap-page-publique", path: "/hommesdeterre", viewport: "mobile" },
  { name: "famille", path: "/hommesdeterre/famille", viewport: "mobile" },
  { name: "producteur", path: "/producteur", viewport: "mobile" },
  { name: "referent", path: "/hommesdeterre/referent", viewport: "desktop" },
  { name: "theme-cambremer", path: "/plateforme/theme/hommesdeterre", viewport: "desktop" },
  { name: "theme-pays-d-auge", path: "/plateforme/theme/pays-d-auge-demo", viewport: "desktop" },
] as const;

const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
};

const colorSchemes = [
  { name: "clair", value: "light" },
  { name: "sombre", value: "dark" },
] as const;

for (const screen of screens) {
  for (const scheme of colorSchemes) {
    test(`${screen.name} (${scheme.name})`, async ({ page }) => {
      await page.setViewportSize(viewports[screen.viewport]);
      await page.emulateMedia({ colorScheme: scheme.value, reducedMotion: "reduce" });
      await page.goto(screen.path);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${screen.name}-${scheme.name}.png`, { fullPage: true });
    });
  }
}
