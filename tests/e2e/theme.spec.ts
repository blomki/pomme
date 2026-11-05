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

test("la barre du bas du producteur mène au catalogue et indique la page courante", async ({
  page,
}) => {
  await page.goto("/producteur");
  const nav = page.getByRole("navigation", { name: "Navigation de l'espace producteur" });
  await expect(nav.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Catalogue" }).click();
  await expect(page).toHaveURL(/\/producteur\/catalogue$/);
  await expect(nav.getByRole("link", { name: "Catalogue" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("le menu latéral et le sélecteur d'espace mènent du référent à l'administration", async ({
  page,
}) => {
  await page.goto("/hommesdeterre/referent");
  const menu = page.getByRole("navigation", { name: "Menu du référent" });
  await expect(menu.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page
    .getByRole("navigation", { name: "Changer d'espace" })
    .getByRole("link", { name: "Administration" })
    .click();
  await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
  await expect(page.getByRole("navigation", { name: "Menu de l'administration" })).toBeVisible();
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
