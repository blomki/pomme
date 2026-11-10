import { expect, test } from "@playwright/test";

import { totpFromBase32 } from "../helpers/totp";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import {
  ADMIN_DEMO,
  enterDemoTotp,
  PLATFORM_ADMIN_DEMO,
  signInByEmail,
  signInWithSecondFactor,
} from "./helpers/auth";

// Espaces réservés et deuxième vérification (story A1), avec les comptes de démonstration.

test("un visiteur est renvoyé vers la connexion", async ({ page }) => {
  await page.goto("/hommesdeterre/admin");
  await expect(page).toHaveURL(/\/connexion$/);
  await page.goto("/plateforme");
  await expect(page).toHaveURL(/\/connexion$/);
});

test("un référent n'a pas accès à l'administration", async ({ page, request }) => {
  await signInByEmail(page, request, "referent.demo@example.org");
  await page.goto("/hommesdeterre/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
});

// Administration et plateforme : écrans d'ordinateur (Chromium). Les tests ci-dessous
// partagent les comptes admin.demo et admin2.demo : ils tournent l'un après l'autre, dans ce
// fichier seulement, pour qu'aucun ne prenne le lien de connexion d'un autre.
test.describe("administration (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écrans d'ordinateur");

  test("un admin passe la deuxième vérification au clavier, puis accède à l'administration", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, ADMIN_DEMO);
    await expect(page).toHaveURL(/\/connexion\/verification\?retour=/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Deuxième vérification" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Code faux : message d'erreur, toujours sur la page.
    const code = page.getByRole("textbox", { name: "Code de l'application d'authentification" });
    await code.focus();
    await page.keyboard.type("000000");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Ce code n'est pas le bon/)).toBeVisible();

    await page.goto("/hommesdeterre/admin");
    await expect(page).toHaveURL(/\/connexion\/verification\?retour=%2Fhommesdeterre%2Fadmin$/);
    await enterDemoTotp(page);
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Administration de l'AMAP" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("le menu latéral et le sélecteur d'espace mènent du référent à l'administration", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
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

  test("le gestionnaire accède à la plateforme après la deuxième vérification", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, PLATFORM_ADMIN_DEMO);
    await page.goto("/plateforme");
    await expect(
      page.getByRole("heading", { level: 1, name: "Gestion de la plateforme" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("un nouvel admin active l'application d'authentification et note ses codes", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, "admin2.demo@example.org");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sécurisez votre compte" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: "Activer l'application d'authentification" }).click();
    await expect(
      page.getByRole("img", { name: "QR code à scanner avec l'application d'authentification" }),
    ).toBeVisible();
    const backupCodes = page.getByRole("region", { name: "2. Notez vos codes de secours" });
    await expect(backupCodes.getByRole("listitem")).toHaveCount(10);
    await expectNoSeriousA11yViolations(page);

    const key = (await page.locator("code").textContent()) ?? "";
    await page.getByRole("textbox", { name: "Code à 6 chiffres" }).fill(totpFromBase32(key));
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();

    // La session est vérifiée : l'administration s'ouvre directement.
    await page.goto("/hommesdeterre/admin");
    await expect(
      page.getByRole("heading", { level: 1, name: "Administration de l'AMAP" }),
    ).toBeVisible();

    // Ménage : le compte doit rester sans moyen de vérification pour la prochaine fois.
    await page.goto("/compte");
    await page.getByRole("button", { name: "Désactiver l'application" }).click();
    await expect(
      page.getByRole("button", { name: "Activer l'application d'authentification" }),
    ).toBeVisible();
  });

  test("un admin corrige l'email d'un membre", async ({ page, request }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/membres");
    await expect(page.getByRole("heading", { level: 1, name: "Membres" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // admin2.demo : aucun autre fichier de test ne s'en sert.
    const correct = async (from: string, to: string) => {
      await page.getByRole("button", { name: "Corriger l'email de Dominique Démo" }).click();
      const dialog = page.getByRole("dialog", { name: "Corriger l'email de Dominique Démo" });
      const field = dialog.getByRole("textbox", { name: "Nouvelle adresse email" });
      await expect(field).toHaveValue(from);
      await field.fill(to);
      await dialog.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Email de Dominique Démo corrigé.")).toBeVisible();
      await expect(page.getByRole("cell", { name: to })).toBeVisible();
    };

    await correct("admin2.demo@example.org", "dominique.nouvelle@example.org");
    // Ménage : on remet l'adresse de démonstration.
    await correct("dominique.nouvelle@example.org", "admin2.demo@example.org");
  });
});
