import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { ADMIN_DEMO, signInByEmail, signInWithSecondFactor } from "./helpers/auth";

// Indisponibilités du trimestre (story G1), avec le jeu de données (pnpm db:seed) : la période
// de réponse du prochain trimestre est ouverte dans la première AMAP ; 8 amapiens ont répondu,
// pas les comptes de démonstration. Le test peut tourner plusieurs fois sur la même base : la
// réponse de amapien.demo est alors déjà enregistrée.
const FAMILY = "amapien.demo@example.org";

test.describe("Mes disponibilités (téléphone)", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "écran de téléphone");

  test("un amapien déclare ses indisponibilités au clavier depuis l'accueil (G1)", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, FAMILY);
    await page.goto("/hommesdeterre/famille");
    const card = page.getByRole("region", { name: /^Vos disponibilités pour / });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: /mes disponibilités$/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mes disponibilités" })).toBeVisible();

    // Déjà répondu lors d'un passage précédent : on repasse en modification.
    const edit = page.getByRole("button", { name: "Modifier" });
    if (await edit.isVisible()) await edit.click();

    // Une seule date cochée, au clavier.
    const boxes = page.getByRole("checkbox");
    const total = await boxes.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      if (await boxes.nth(i).isChecked()) {
        await boxes.nth(i).focus();
        await page.keyboard.press("Space");
      }
    }
    await boxes.first().focus();
    await page.keyboard.press("Space");
    await expect(boxes.first()).toBeChecked();
    await expect(page.getByText(`1 distribution sur ${total}`)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: /^(Envoyer|Enregistrer)$/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").getByText(/^Réponse enregistrée\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifier" })).toBeVisible();

    // L'accueil le montre.
    await page.goto("/hommesdeterre/famille");
    await expect(page.getByText("1 indisponibilité déclarée.", { exact: false })).toBeVisible();
  });
});

test.describe("Disponibilités du trimestre (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  test("un admin suit les réponses, filtre et relance une personne au clavier (G1)", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/planning");
    await page.getByRole("link", { name: "Disponibilités du trimestre" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /^Disponibilités · .* \d{4}$/ }),
    ).toBeVisible();
    await expect(page.getByText(/^\d+ amapiens sur \d+ ont répondu$/).first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    const table = page.getByRole("table", { name: "Réponses des amapiens" });
    await page.getByRole("button", { name: /^Sans réponse \(\d+\)$/ }).click();
    await expect(table.getByText("Répondu le", { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: /^Ont répondu \(\d+\)$/ }).click();
    await expect(table.getByText("Sans réponse")).toHaveCount(0);
    await page.getByRole("button", { name: /^Tous \(\d+\)$/ }).click();

    // Relance individuelle de Dominique (admin2.demo, sans réponse), au clavier.
    const remind = page.getByRole("button", { name: "Relancer Dominique Démo" });
    await remind.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(/^(1 relance envoyée\.|Aucun email envoyé \(déjà relancé aujourd'hui\)\.)$/),
    ).toBeVisible();
  });
});
