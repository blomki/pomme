import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";

// Charte de la plateforme et écran de connexion (fiche #123).

/** Fond du widget Friendly Captcha (src/ui/forms/Captcha.tsx), en clair et en sombre. */
const CAPTCHA_BACKGROUND = { light: "rgb(250, 250, 250)", dark: "rgb(23, 23, 23)" };
/** Largeur du widget, plus les marges intérieures de la carte (24 px, 16 px sur téléphone). */
const CARD_MAX_WIDTH = { desktop: 316 + 2 * 24, phone: 316 + 2 * 16 };

const card = (page: Page) =>
  page.locator(".MuiCard-root").filter({ has: page.getByRole("heading", { name: "Connexion" }) });

for (const scheme of ["light", "dark"] as const) {
  test(`connexion en ${scheme === "light" ? "clair" : "sombre"} : charte de la plateforme, carte du fond du widget`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/connexion");
    const heading = page.getByRole("heading", { level: 1, name: "Connexion" });
    await expect(heading).toBeVisible();

    // Titres en Source Sans ; fond de page #F8FAFC en clair.
    const font = await heading.evaluate((h) => getComputedStyle(h).fontFamily);
    expect(font).toMatch(/source/i);
    if (scheme === "light") {
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background).toBe("rgb(248, 250, 252)");
    }

    // Carte : même fond que le widget, pas plus large que lui, sans défilement horizontal.
    const box = card(page);
    await expect(box).toHaveCSS("background-color", CAPTCHA_BACKGROUND[scheme]);
    const width = (await box.boundingBox())!.width;
    const phone = testInfo.project.name === "webkit-mobile";
    expect(width).toBeLessThanOrEqual(phone ? CARD_MAX_WIDTH.phone : CARD_MAX_WIDTH.desktop);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoSeriousA11yViolations(page);
  });
}

test("une AMAP garde son propre thème", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/hommesdeterre");
  const font = await page
    .getByRole("heading", { level: 1 })
    .evaluate((h) => getComputedStyle(h).fontFamily);
  expect(font).not.toMatch(/source/i);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe("rgb(248, 250, 252)");
});

for (const scheme of ["light", "dark"] as const) {
  test(`message de déconnexion en ${scheme === "light" ? "clair" : "sombre"} : annoncé, lisible, fermé au clavier`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/connexion?deconnexion=tous");
    const message = page.getByRole("status").filter({
      hasText: "Vous êtes déconnecté de tous vos appareils.",
    });
    await expect(message).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await message.getByRole("button", { name: "Fermer le message" }).focus();
    await page.keyboard.press("Enter");
    await expect(message).toBeHidden();
  });
}
