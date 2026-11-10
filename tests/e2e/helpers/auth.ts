import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { totpCode } from "../../helpers/totp";

import { inboxSnapshot, newMagicLink } from "./mailpit";

/**
 * Secret de l'application d'authentification des comptes de démonstration admin.demo et
 * gestionnaire.demo (src/db/seed/data.ts, DEMO_TOTP_SECRET). Public, données fictives.
 */
const DEMO_TOTP_SECRET = Buffer.from("PommeDemoTotpNePasUtiliserEnProd", "utf8");

export const ADMIN_DEMO = "admin.demo@example.org";
export const PLATFORM_ADMIN_DEMO = "gestionnaire.demo@example.org";

/** Demande un lien de connexion et l'ouvre. */
export async function signInByEmail(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/connexion");
  await page.getByRole("textbox", { name: "Adresse email" }).fill(email);
  const before = await inboxSnapshot(request, email);
  await page.getByRole("button", { name: "Recevoir un lien de connexion" }).click();
  await expect(page.getByText(/un lien de connexion vient d'être envoyé/)).toBeVisible();
  await page.goto(await newMagicLink(request, email, before));
}

/** Connexion d'un compte de démonstration admin : lien magique, puis code de l'application. */
export async function signInWithSecondFactor(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  await signInByEmail(page, request, email);
  await expect(
    page.getByRole("heading", { level: 1, name: "Deuxième vérification" }),
  ).toBeVisible();
  await enterDemoTotp(page);
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
}

/** Saisit le code de l'application de démonstration sur la page de deuxième vérification. */
export async function enterDemoTotp(page: Page) {
  await page
    .getByRole("textbox", { name: "Code de l'application d'authentification" })
    .fill(totpCode(DEMO_TOTP_SECRET));
  await page.getByRole("button", { name: "Vérifier" }).click();
}
