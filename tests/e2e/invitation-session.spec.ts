import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { signInByEmail } from "./helpers/auth";
import { inboxSnapshot, newMessage } from "./helpers/mailpit";

// Fiche #134 : invitation dans un foyer ouverte sur un navigateur où un autre compte est connecté
// (l'ordinateur partagé du foyer). La personne invitée ne doit jamais arriver dans l'espace de
// l'autre. Adresses uniques à chaque passage : le test peut tourner plusieurs fois.
const SASHA = "amapien.demo@example.org";

/** Sasha invite une adresse depuis « Mon profil » ; renvoie le lien de l'email d'invitation. */
async function invite(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/compte");
  await page.getByRole("button", { name: "Ajouter un membre" }).click();
  const before = await inboxSnapshot(request, email);
  await page.getByRole("textbox", { name: "Email de la personne à inviter" }).fill(email);
  await page.keyboard.press("Enter");
  await expect(page.getByText(`Invitation envoyée à ${email}.`)).toBeVisible();
  const { Text } = await newMessage(request, email, before);
  const link = Text.match(/https?:\/\/\S+\/connexion\/invitation\?jeton=\S+/)?.[0] ?? "";
  expect(link).not.toBe("");
  return link;
}

/** Ménage : Sasha retire le membre ajouté, pour garder son foyer tel que le jeu de données. */
async function removeMember(page: Page, firstName: string) {
  await page.goto("/compte");
  await page.getByRole("button", { name: `Retirer ${firstName}` }).click();
  await page.getByRole("alert").getByRole("button", { name: "Retirer" }).click();
  await expect(page.getByText(`${firstName} a été retiré du foyer`)).toBeVisible();
}

test.describe("Invitation ouverte avec une autre session (#134)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");
  test.slow();

  test("session de Sasha ouverte, invitation pour Anatole : avertissement, session fermée, jamais l'espace de Sasha", async ({
    page,
    request,
  }) => {
    const anatole = `anatole.${Date.now().toString(36)}@example.org`;
    await signInByEmail(page, request, SASHA);
    const link = await invite(page, request, anatole);

    // Même navigateur : la session de Sasha est signalée, rien n'est encore proposé à remplir.
    await page.goto(link);
    await expect(page.getByText(/^Vous êtes connecté\(e\) en tant que Sasha/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Prénom" })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    await page.getByRole("button", { name: `Continuer en tant que ${anatole}` }).click();

    // Session de Sasha fermée : le formulaire de l'invitation s'affiche.
    await page.getByRole("textbox", { name: "Prénom" }).fill("Anatole");
    await page.getByRole("button", { name: "Rejoindre le foyer" }).click();
    await expect(page.getByText(/^Vous avez rejoint le foyer/)).toBeVisible();
    await page.getByRole("link", { name: "Me connecter" }).click();
    await expect(page).toHaveURL(/\/connexion\?email=/);
    await expect(page.getByRole("textbox", { name: "Adresse email" })).toHaveValue(anatole);

    // Sasha doit se reconnecter : sa session a bien été fermée. Ménage.
    await signInByEmail(page, request, SASHA);
    await removeMember(page, "Anatole");
  });

  test("session de la personne invitée ouverte : acceptation, puis son espace", async ({
    page,
    request,
    browser,
  }) => {
    const camille = `camille.${Date.now().toString(36)}@example.org`;
    await signInByEmail(page, request, SASHA);
    const link = await invite(page, request, camille);

    // Camille, dans son propre navigateur, se connecte puis ouvre l'invitation.
    const context = await browser.newContext();
    const own = await context.newPage();
    await signInByEmail(own, request, camille);
    await own.goto(link);
    await expect(own.getByText(/^Vous êtes connecté\(e\) en tant que/)).toHaveCount(0);
    await own.getByRole("textbox", { name: "Prénom" }).fill("Camille");
    await own.getByRole("button", { name: "Rejoindre le foyer" }).click();
    await expect(own).toHaveURL(/\/hommesdeterre\/famille$/);
    await context.close();

    await removeMember(page, "Camille");
  });
});
