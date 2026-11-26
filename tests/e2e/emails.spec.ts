import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { ADMIN_DEMO, signInWithSecondFactor } from "./helpers/auth";

// Emails groupés (story H1), avec le jeu de données (pnpm db:seed) : période de commande
// ouverte, adhérents fictifs (adresses @example.org, reçues par Mailpit).

test.describe("Envoyer un email (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  test("un admin prépare un email avec un modèle et une balise, le teste puis l'envoie, au clavier (H1)", async ({
    page,
    request,
  }) => {
    const run = Date.now().toString(36);
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin");
    const menu = page
      .getByRole("navigation", { name: "Navigation administrateur" })
      .getByRole("link", { name: "Emails" });
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Envoyer un email" })).toBeVisible();
    await expect(page.getByText(/^\d+ destinataires \(\d+ foyers\)$/)).toBeVisible();

    // Modèle « ouverture de la période de commande » : objet et message remplacés.
    await page
      .getByRole("combobox", { name: "Modèle" })
      .selectOption({ label: "Ouverture de la période de commande" });
    const subject = page.getByRole("textbox", { name: "Objet" });
    await expect(subject).toHaveValue(/^Les commandes sont ouvertes jusqu'au /);
    await subject.fill(`Commandes de décembre ${run} pour {{prenom}}`);

    // Balise insérée d'un clic (clavier : Entrée sur la puce), dans le message.
    const body = page.getByRole("textbox", { name: "Message" });
    await body.focus();
    await page.keyboard.press("Control+End");
    await page.getByRole("button", { name: "Insérer {{nom}}" }).focus();
    await page.keyboard.press("Enter");
    await expect(body).toHaveValue(/\{\{nom\}\}$/);

    // Aperçu : balises remplacées pour la personne choisie dans « Vu par ».
    const preview = page.getByRole("region", { name: "Aperçu" });
    const viewer = preview.getByRole("combobox", { name: "Vu par" });
    const viewerName = (await viewer.locator("option:checked").textContent()) ?? "";
    const firstName = viewerName.split(" ")[0]!;
    await expect(preview.getByText(`Commandes de décembre ${run} pour ${firstName}`)).toBeVisible();
    await expect(preview.getByText(/\{\{/)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // Balise inconnue : avertissement.
    await subject.fill(`Commandes ${run} {{prenon}}`);
    await expect(
      page.getByText(/^Balise inconnue, laissée telle quelle : \{\{prenon\}\}/),
    ).toBeVisible();
    await subject.fill(`Commandes de décembre ${run}`);

    await page.getByRole("button", { name: "M'envoyer un test" }).click();
    await expect(page.getByText(/^Email de test envoyé à /)).toBeVisible();

    // Envoi, après confirmation.
    await page.getByRole("button", { name: /^Envoyer à \d+ destinataires$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Confirmer l'envoi groupé ?" });
    await expect(dialog).toContainText(`« Commandes de décembre ${run} »`);
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    await dialog.getByRole("button", { name: "Envoyer" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^Email envoyé à \d+ destinataires\.$/)).toBeVisible();

    // Nouvel envoi en tête de l'historique.
    const history = page.getByRole("table", { name: "Historique des envois" });
    await expect(history.getByRole("row").nth(1)).toContainText(`Commandes de décembre ${run}`);
    await expect(history.getByRole("row").nth(1)).toContainText("Tous les adhérents");
  });
});
