import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { signInByEmail } from "./helpers/auth";

// Comportements du thème et des gabarits : mode d'affichage, navigation, messages.

const FAMILY = "amapien.demo@example.org";

// Apparence (fiche #127) : choisie dans « Mon profil », section « Affichage » ; plus aucun
// sélecteur dans les en-têtes. Le choix est gardé par le navigateur et vaut pour toutes les pages.
test("l'apparence choisie dans Mon profil s'applique aussitôt et persiste, connexion comprise", async ({
  page,
  request,
  browserName,
}) => {
  // Deux connexions dans le même test : plus de temps.
  test.slow();
  await page.emulateMedia({ colorScheme: "light" });
  await signInByEmail(page, request, FAMILY);
  await page.goto("/compte");
  const display = page.getByRole("group", { name: "Affichage" });
  await expect(display.getByRole("button", { name: "Clair" })).toBeVisible();
  await expect(display.getByRole("button", { name: "Système" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoSeriousA11yViolations(page);

  // Au clavier, sans rechargement.
  await display.getByRole("button", { name: "Sombre" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
  await expect(display.getByRole("button", { name: "Sombre" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Espaces et pages publiques : le choix s'applique, sans bouton dans l'en-tête.
  for (const path of ["/hommesdeterre/famille", "/hommesdeterre"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
    await expect(page.getByRole("button", { name: "Sombre" })).toHaveCount(0);
  }

  // Déconnexion puis reconnexion : toujours sombre, page de connexion comprise. Chromium
  // seulement : en local (http://localhost), WebKit garde le cookie sécurisé de session après la
  // déconnexion, une limite de l'environnement de test sans rapport avec l'apparence.
  if (browserName !== "chromium") return;
  await page.goto("/compte/securite");
  await page.getByRole("button", { name: "Me déconnecter", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
  await expect(page.getByRole("button", { name: "Sombre" })).toHaveCount(0);
  await signInByEmail(page, request, FAMILY);
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
});

test("« Système » suit l'appareil", async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signInByEmail(page, request, FAMILY);
  await page.goto("/compte");
  const display = page.getByRole("group", { name: "Affichage" });
  await display.getByRole("button", { name: "Clair" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "light");
  await display.getByRole("button", { name: "Système" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "light");
});

test("sans choix enregistré, les pages sans connexion suivent le système, sans bouton", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const path of ["/", "/connexion", "/hommesdeterre"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
    await expect(page.getByRole("group", { name: "Apparence" })).toHaveCount(0);
  }
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
