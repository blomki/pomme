import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { countMessagesTo, magicLinkSince } from "./helpers/mailpit";

// Connexion sans mot de passe, avec les comptes de démonstration du jeu de données
// (pnpm db:seed). Chaque projet de navigateur a son compte, pour ne pas se gêner.
const ACCOUNTS: Record<string, string> = {
  chromium: "amapien.demo@example.org",
  "webkit-mobile": "amapien2.demo@example.org",
};
const emailFor = (project: string) => ACCOUNTS[project] ?? "amapien.demo@example.org";

test("connexion par lien magique au clavier, puis déconnexion de tous les appareils", async ({
  page,
  request,
}, testInfo) => {
  const email = emailFor(testInfo.project.name);

  await page.goto("/connexion");
  await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Clavier seul : saisie puis Entrée.
  await page.getByRole("textbox", { name: "Adresse email" }).focus();
  await page.keyboard.type(email);
  const since = new Date();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/un lien de connexion vient d'être envoyé/)).toBeVisible();

  await page.goto(await magicLinkSince(request, email, since));
  await expect(page).toHaveURL(/\/connexion\/bienvenue$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Bienvenue/ })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByRole("link", { name: "Plus tard" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByRole("button", { name: "Me déconnecter de tous mes appareils" }).click();
  await expect(page.getByText("Vous êtes déconnecté de tous vos appareils.")).toBeVisible();
  await page.goto("/compte");
  await expect(page).toHaveURL(/\/connexion$/);
});

test("un lien déjà utilisé est refusé", async ({ page, request }, testInfo) => {
  const email = emailFor(testInfo.project.name);
  await page.goto("/connexion");
  await page.getByRole("textbox", { name: "Adresse email" }).fill(email);
  const since = new Date();
  await page.getByRole("button", { name: "Recevoir un lien de connexion" }).click();
  const link = await magicLinkSince(request, email, since);
  await page.goto(link);
  await expect(page).toHaveURL(/\/connexion\/bienvenue$/);
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByText(/n'est plus valable/)).toBeVisible();
});

test("une adresse inconnue reçoit la même réponse, sans email", async ({ page, request }) => {
  await page.goto("/connexion");
  await page.getByRole("textbox", { name: "Adresse email" }).fill("personne@example.org");
  await page.getByRole("button", { name: "Recevoir un lien de connexion" }).click();
  await expect(page.getByText(/un lien de connexion vient d'être envoyé/)).toBeVisible();
  expect(await countMessagesTo(request, "personne@example.org")).toBe(0);
});

test("passkey : création après connexion, puis connexion sans email", async ({
  page,
  request,
  browserName,
}, testInfo) => {
  // Authentificateur virtuel (WebAuthn) : disponible dans Chromium seulement.
  test.skip(browserName !== "chromium", "authentificateur virtuel propre à Chromium");
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });

  const email = emailFor(testInfo.project.name);
  await page.goto("/connexion");
  await page.getByRole("textbox", { name: "Adresse email" }).fill(email);
  const since = new Date();
  await page.getByRole("button", { name: "Recevoir un lien de connexion" }).click();
  await page.goto(await magicLinkSince(request, email, since));

  await page.getByRole("button", { name: "Créer une passkey" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  await expect(page.getByText("Passkey 1")).toBeVisible();

  await page.getByRole("button", { name: "Me déconnecter", exact: true }).click();
  await expect(page.getByText("Vous êtes déconnecté.")).toBeVisible();

  await page.getByRole("button", { name: "Se connecter avec une passkey" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();

  // Ménage : la passkey ne doit pas gêner les autres tests.
  await page.getByRole("button", { name: /^Supprimer/ }).click();
  await expect(page.getByText("Aucune passkey enregistrée.")).toBeVisible();
});
