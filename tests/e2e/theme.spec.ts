import { expect, test } from "@playwright/test";

// Comportements du thème et des gabarits : mode d'affichage, navigation, messages.

test("le mode sombre choisi est appliqué et mémorisé", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/hommesdeterre");
  await page.getByRole("button", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
  await expect(page.getByRole("button", { name: "Sombre" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("le mode automatique suit l'appareil", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/hommesdeterre");
  await page.getByRole("button", { name: "Automatique (comme l'appareil)" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "light");
});

test("un message de confirmation propose d'annuler", async ({ page }) => {
  await page.goto("/plateforme/theme/hommesdeterre");
  const quantity = page.getByRole("spinbutton", { name: "Quantité" });
  await quantity.fill("5");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Quantité enregistrée.")).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByText("Modification annulée.")).toBeVisible();
  await expect(quantity).toHaveValue("2");
});

test("les titres de l'AMAP de Cambremer utilisent sa police (Pattaya)", async ({ page }) => {
  await page.goto("/hommesdeterre");
  const fontFamily = await page
    .getByRole("heading", { level: 1 })
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontFamily.toLowerCase()).toContain("pattaya");
});
