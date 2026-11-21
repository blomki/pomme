import { expect, test } from "@playwright/test";

// Captures des écrans clés, en thème clair et sombre, comparées aux images de référence
// de tests/visual/__screenshots__/. Un écart de plus de 1 % des pixels fait échouer le test :
// on regarde alors la différence dans le rapport Playwright, puis on corrige le code ou on
// met à jour les références (étiquette « captures » sur la PR, voir README).
const screens = [
  { name: "accueil", path: "/", viewport: "mobile" },
  // Blocs datés de l'accueil (prochaine distribution, dernier billet) masqués : ils changent
  // chaque jour.
  {
    name: "amap-page-publique",
    path: "/hommesdeterre",
    viewport: "mobile",
    mask: ["Prochaine distribution", "Dernières nouvelles"],
  },
  { name: "referent", path: "/hommesdeterre/referent", viewport: "desktop" },
  { name: "theme-cambremer", path: "/plateforme/theme/hommesdeterre", viewport: "desktop" },
  { name: "theme-pays-d-auge", path: "/plateforme/theme/pays-d-auge-demo", viewport: "desktop" },
] as const satisfies ReadonlyArray<{
  name: string;
  path: string;
  viewport: "mobile" | "desktop";
  mask?: readonly string[];
}>;

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
      const mask = ("mask" in screen ? screen.mask : []).map((name) =>
        page.getByRole("region", { name }),
      );
      await expect(page).toHaveScreenshot(`${screen.name}-${scheme.name}.png`, {
        fullPage: true,
        mask,
      });
    });
  }
}

// Feuille d'émargement (E3), telle qu'imprimée en A4 : page de démonstration aux données fixes,
// pour que la capture ne change pas d'un mois à l'autre.
test("feuille d'émargement (impression)", async ({ page }) => {
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 à 96 points par pouce
  await page.emulateMedia({ media: "print", colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/plateforme/demo/emargement");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("feuille-emargement-impression.png", { fullPage: true });
});
