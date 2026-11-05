import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";

// Chaque page existante s'affiche, a un titre de niveau 1 et passe le contrôle d'accessibilité.
// La liste s'allongera avec les écrans de chaque fiche.
const pages = [
  { path: "/", title: "Pomme" },
  { path: "/hommesdeterre", title: "AMAP « hommesdeterre »" },
  { path: "/hommesdeterre/famille", title: "Espace famille" },
  { path: "/hommesdeterre/referent", title: "Espace référent" },
  { path: "/hommesdeterre/admin", title: "Administration de l'AMAP" },
  { path: "/producteur", title: "Espace producteur" },
  { path: "/plateforme", title: "Gestion de la plateforme" },
];

for (const { path, title } of pages) {
  test(`la page ${path} s'affiche et est accessible`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expectNoSeriousA11yViolations(page);
  });
}

test("le lien « Aller au contenu » est le premier élément atteint au clavier", async ({
  page,
  browserName,
}) => {
  // Safari (WebKit) ne parcourt pas les liens avec Tab par défaut : test sur Chromium seulement.
  test.skip(browserName === "webkit", "Tab ne s'arrête pas sur les liens dans Safari");
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#contenu$/);
});
