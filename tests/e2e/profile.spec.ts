import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { ADMIN_DEMO, signInByEmail, signInWithSecondFactor } from "./helpers/auth";
import { inboxSnapshot, newMessage } from "./helpers/mailpit";

// « Mon profil » et « Mon foyer » (story A3), avec le jeu de données (pnpm db:seed). Adresses
// fictives (@example.org), uniques à chaque passage : le test peut tourner plusieurs fois.
const FAMILY = "amapien.demo@example.org";

test.describe("Mon profil (téléphone)", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "écran de téléphone");

  test("un amapien modifie son téléphone, invite un membre qui rejoint le foyer, puis le retire (A3)", async ({
    page,
    request,
  }) => {
    const invitee = `invite.${Date.now().toString(36)}@example.org`;
    await signInByEmail(page, request, FAMILY);
    await page.goto("/compte");
    await expect(page.getByRole("heading", { level: 1, name: "Mon profil" })).toBeVisible();
    await expect(page.getByText(FAMILY)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Téléphone invalide : signalé, enregistrement bloqué ; puis un numéro valable, au clavier.
    const phone = page.getByRole("textbox", { name: "Téléphone" });
    await phone.fill("12");
    await expect(page.getByText(/^Numéro invalide/)).toBeVisible();
    const save = page.getByRole("button", { name: "Enregistrer" });
    await expect(save).toBeDisabled();
    await phone.fill("06 98 76 54 31");
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Informations enregistrées.")).toBeVisible();

    // Inviter un membre : lien par email.
    await page.getByRole("button", { name: "Ajouter un membre" }).click();
    const before = await inboxSnapshot(request, invitee);
    await page.getByRole("textbox", { name: "Email de la personne à inviter" }).fill(invitee);
    await page.keyboard.press("Enter");
    await expect(page.getByText(`Invitation envoyée à ${invitee}.`)).toBeVisible();
    await expect(page.getByText(invitee, { exact: true })).toBeVisible();

    const { Subject, Text } = await newMessage(request, invitee, before);
    expect(Subject).toMatch(/vous invite dans le foyer/);
    const link = Text.match(/https?:\/\/\S+\/connexion\/invitation\?jeton=\S+/)?.[0] ?? "";
    expect(link).not.toBe("");

    // La personne invitée ouvre le lien (sans être connectée) et rejoint le foyer.
    // Autre contexte de navigateur : la personne invitée n'a pas la session de l'amapien.
    const invitedContext = await page.context().browser()!.newContext();
    const other = await invitedContext.newPage();
    await other.goto(link);
    await expect(
      other.getByRole("heading", { level: 1, name: /^Rejoindre le foyer / }),
    ).toBeVisible();
    await other.getByRole("textbox", { name: "Prénom" }).fill("Invité");
    await expectNoSeriousA11yViolations(other);
    await other.getByRole("button", { name: "Rejoindre le foyer" }).click();
    await expect(other.getByText(/^Vous avez rejoint le foyer/)).toBeVisible();
    await invitedContext.close();

    // De retour sur « Mon profil » : le nouveau membre est là ; on le retire, avec confirmation.
    await page.reload();
    const remove = page.getByRole("button", { name: /^Retirer Invité/ });
    await expect(remove).toBeVisible();
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert").getByText(/^Retirer Invité du foyer \?/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByRole("alert").getByRole("button", { name: "Retirer" }).click();
    await expect(page.getByText(/^Invité a été retiré du foyer/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Retirer Invité/ })).toHaveCount(0);
  });
});

test.describe("Mode (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  test("une personne à plusieurs rôles change de mode depuis son profil ; le choix est mémorisé (A3)", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/compte");
    const mode = page.getByRole("combobox", { name: /^Changer de mode/ });
    await expect(mode).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await mode.selectOption({ label: "Mode référent" });
    await expect(page).toHaveURL(/\/hommesdeterre\/referent$/);

    // Ménage : l'administration redevient l'espace d'arrivée de ce compte pour les autres tests.
    await page.goto("/compte");
    await page
      .getByRole("combobox", { name: /^Changer de mode/ })
      .selectOption({ label: "Mode administrateur" });
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
  });
});
