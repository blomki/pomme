import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { signInWithSecondFactor } from "./helpers/auth";

// Espaces admin et référent sur téléphone (story S14) : menu replié derrière un bouton, tiroir
// qui garde le focus, se ferme avec Échap ou en choisissant une entrée, et aucune page plus
// large que l'écran.
test.describe("espace référent (téléphone)", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "vue téléphone");
  test.use({ viewport: { width: 360, height: 740 } });

  test("le menu se replie, s'ouvre au clavier et se referme (S14)", async ({ page, request }) => {
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await expect(page.getByRole("navigation", { name: "Navigation référent" })).toBeHidden();

    // Pas de défilement horizontal à 360 px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const toggle = page.getByRole("button", { name: "Ouvrir le menu de navigation" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("navigation", { name: "Navigation référent" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByText(/foyers? actifs? · \d+ producteurs?/).filter({ visible: true }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Échap ferme le menu et rend le focus au bouton.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();

    // Choisir une entrée ferme le menu et ouvre l'écran.
    await toggle.click();
    await menu.getByRole("link", { name: "Avoirs" }).click();
    await expect(page).toHaveURL(/\/hommesdeterre\/referent\/avoirs$/);
    await expect(menu).toBeHidden();
  });
});
