import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { ADMIN_DEMO, signInByEmail, signInWithSecondFactor } from "./helpers/auth";

// « Connexion et sécurité » (/compte/securite) s'affiche pour chaque état de compte (fiche #124).
// La page plantait pour un admin dont la deuxième vérification n'était pas faite : elle passait
// un lien Next (une fonction) à un bouton MUI, ce qu'une page serveur ne peut pas faire.
test.describe("Connexion et sécurité, selon l'état du compte", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  async function expectSecurityPage(page: Page) {
    await page.goto("/compte/securite");
    await expect(
      page.getByRole("heading", { level: 1, name: "Connexion et sécurité" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Me déconnecter", exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  }

  test("amapien : pas de deuxième vérification demandée", async ({ page, request }) => {
    await signInByEmail(page, request, "amapien.demo@example.org");
    await expectSecurityPage(page);
  });

  test("admin avec application, vérification pas encore faite", async ({ page, request }) => {
    await signInByEmail(page, request, ADMIN_DEMO);
    await expectSecurityPage(page);
    const verify = page.getByRole("link", { name: "Faire la deuxième vérification" });
    await expect(verify).toBeVisible();
    await verify.click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Deuxième vérification" }),
    ).toBeVisible();
  });

  test("admin avec application, vérification faite", async ({ page, request }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await expectSecurityPage(page);
    await expect(page.getByRole("link", { name: "Faire la deuxième vérification" })).toBeHidden();
  });

  test("admin sans aucun moyen de vérification", async ({ page, request }) => {
    await signInByEmail(page, request, "admin2.demo@example.org");
    await expectSecurityPage(page);
  });

  test("référent sans aucun moyen de vérification", async ({ page, request }) => {
    await signInByEmail(page, request, "referent2.demo@example.org");
    await expectSecurityPage(page);
  });

  test("producteur", async ({ page, request }) => {
    await signInByEmail(page, request, "producteur.demo@example.org");
    await expectSecurityPage(page);
  });
});
