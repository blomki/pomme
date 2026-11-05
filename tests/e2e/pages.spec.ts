import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";

// Chaque page existante s'affiche, a un titre de niveau 1 et passe le contrôle d'accessibilité
// (contrastes compris), en mode clair et en mode sombre. La base doit contenir le jeu de données
// fictif (pnpm db:seed). La liste s'allongera avec les écrans de chaque fiche.
const pages = [
  { path: "/", title: "Pomme" },
  { path: "/connexion", title: "Connexion" },
  { path: "/hommesdeterre", title: "AMAP de démonstration de Cambremer" },
  { path: "/pays-d-auge-demo", title: "AMAP fictive du Pays d'Auge" },
  { path: "/hommesdeterre/famille", title: "Espace famille" },
  { path: "/hommesdeterre/referent", title: "Espace référent" },
  { path: "/hommesdeterre/admin", title: "Administration de l'AMAP" },
  { path: "/producteur", title: "Espace producteur" },
  { path: "/producteur/catalogue", title: "Catalogue" },
  { path: "/plateforme", title: "Gestion de la plateforme" },
  { path: "/plateforme/theme/hommesdeterre", title: "Thème de AMAP de démonstration de Cambremer" },
  { path: "/plateforme/theme/pays-d-auge-demo", title: "Thème de AMAP fictive du Pays d'Auge" },
];

for (const colorScheme of ["light", "dark"] as const) {
  for (const { path, title } of pages) {
    test(`la page ${path} s'affiche et est accessible (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", colorScheme);
      await expectNoSeriousA11yViolations(page);
    });
  }
}

test("une AMAP inconnue donne une page 404", async ({ page }) => {
  const response = await page.goto("/amap-inexistante");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
});

test("le lien « Aller au contenu » est le premier élément atteint au clavier", async ({
  page,
  browserName,
}) => {
  // Safari (WebKit) ne parcourt pas les liens avec Tab par défaut : test sur Chromium seulement.
  test.skip(browserName === "webkit", "Tab ne s'arrête pas sur les liens dans Safari");
  await page.goto("/hommesdeterre/admin");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#contenu$/);
});
