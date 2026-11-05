import { expect, test } from "@playwright/test";

// Captures des écrans clés, en thème clair et sombre, comparées aux images de référence
// de tests/visual/__screenshots__/. Un écart de plus de 1 % des pixels fait échouer le test :
// on regarde alors la différence dans le rapport Playwright, puis on corrige le code ou on
// met à jour les références (workflow « Mettre à jour les captures », voir README).
// Les écrans clés s'ajouteront ici au fil des fiches (S4 : thème, puis commande, pointage…).
const screens = [
  { name: "accueil", path: "/" },
  { name: "amap-page-publique", path: "/hommesdeterre" },
];

const colorSchemes = [
  { name: "clair", value: "light" },
  { name: "sombre", value: "dark" },
] as const;

for (const screen of screens) {
  for (const scheme of colorSchemes) {
    test(`${screen.name} (${scheme.name})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme.value });
      await page.goto(screen.path);
      await expect(page).toHaveScreenshot(`${screen.name}-${scheme.name}.png`, { fullPage: true });
    });
  }
}
