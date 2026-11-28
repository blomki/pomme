import { expect, test, type Page } from "@playwright/test";

import { ADMIN_DEMO, signInByEmail, signInWithSecondFactor } from "./helpers/auth";

// Fiche #128 : une personne déjà connectée qui ouvre / ou /connexion arrive à l'accueil de son
// espace (via /connexion/suite), sans boucle de redirection.
test.describe("Personne connectée sur / et /connexion", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  /** Ouvre l'adresse et vérifie qu'elle aboutit à une page qui s'affiche (pas de boucle). */
  async function open(page: Page, path: string) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
  }

  test("non connecté : / présente Pomme et la connexion", async ({ page }) => {
    await open(page, "/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Pomme" })).toBeVisible();
    await open(page, "/connexion");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
  });

  test("un seul espace : / et /connexion mènent à son accueil", async ({ page, request }) => {
    await signInByEmail(page, request, "amapien.demo@example.org");
    for (const path of ["/", "/connexion"]) {
      await open(page, path);
      await expect(page).toHaveURL(/\/hommesdeterre\/famille$/);
    }
  });

  test("plusieurs espaces : / mène au mode mémorisé", async ({ page, request }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await open(page, "/hommesdeterre/admin");

    // Choisir le mode référent dans l'en-tête le mémorise sur le compte.
    await page.getByRole("button", { name: "Mode administrateur" }).click();
    await page.getByRole("menuitem", { name: "Mode référent" }).click();
    await expect(page).toHaveURL(/\/hommesdeterre\/referent$/);
    await open(page, "/");
    await expect(page).toHaveURL(/\/hommesdeterre\/referent$/);

    // Ménage : l'administration redevient l'espace d'arrivée de ce compte pour les autres tests.
    await page.getByRole("button", { name: "Mode référent" }).click();
    await page.getByRole("menuitem", { name: "Mode administrateur" }).click();
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
    await open(page, "/connexion");
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
  });

  test("admin sans deuxième vérification faite : / mène à la vérification", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, ADMIN_DEMO);
    await open(page, "/");
    await expect(page).toHaveURL(/\/connexion\/verification/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Deuxième vérification" }),
    ).toBeVisible();
  });

  test("les pages de connexion utiles à une personne connectée restent accessibles", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, ADMIN_DEMO);
    await open(page, "/connexion/verification");
    await expect(page).toHaveURL(/\/connexion\/verification/);
  });
});
