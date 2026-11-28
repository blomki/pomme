import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { signInByEmail, signInWithSecondFactor } from "./helpers/auth";
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
    await expect(other.getByText(/^Vous faites maintenant partie du foyer/)).toBeVisible();
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

/**
 * Clique sur « Retour » jusqu'à arriver à destination : un clic donné avant que la page ne soit
 * prête (serveur de développement) peut être perdu.
 */
async function goBack(page: Page, destination: RegExp) {
  await expect(async () => {
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(destination, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("Mode et retour (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  test("le mode se choisit dans l'en-tête de l'espace consomm'acteur ; « Retour » ramène à son accueil (#126)", async ({
    page,
    request,
  }) => {
    // referent.demo : référent et membre d'un foyer, donc deux modes.
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/famille");
    const header = page.getByRole("banner");
    const mode = header.getByRole("button", { name: "Mode consomm'acteur" });
    await expect(mode).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Au clavier : le menu s'ouvre avec Entrée ; le choix ouvre l'accueil du mode et le mémorise.
    await mode.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Mode référent" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/hommesdeterre\/referent$/);

    // « Mon profil » n'a plus de section « Mode » ; la flèche ramène à l'accueil du mode courant.
    await page.goto("/compte");
    await expect(page.getByRole("heading", { level: 1, name: "Mon profil" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mode" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: /^Changer de mode/ })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    await goBack(page, /\/hommesdeterre\/referent$/);

    // « Connexion et sécurité » : la flèche ramène à « Mon profil ».
    await page.goto("/compte/securite");
    await goBack(page, /\/compte$/);
  });

  test("avec un seul mode, pas de bouton « Mode » ; « Retour » mène à son espace", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, FAMILY);
    await page.goto("/hommesdeterre/famille");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mode / })).toHaveCount(0);
    // Sans mode mémorisé : /connexion/suite choisit l'accueil, l'espace unique ici.
    await page.goto("/compte");
    await goBack(page, /\/hommesdeterre\/famille$/);
  });
});
