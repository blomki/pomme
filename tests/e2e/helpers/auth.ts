import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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
  await openMagicLink(page, await newMagicLink(request, email, before));
}

/**
 * Ouvre le lien de connexion. Better Auth limite l'ouverture des liens par adresse IP et par
 * minute (contre les essais de jetons au hasard, src/server/auth/auth.ts) : toute la suite
 * tourne depuis la même adresse, et les tests rejoués peuvent dépasser la limite. Réponse 429 :
 * le lien n'a pas été utilisé, on attend la minute suivante et on le rouvre.
 */
async function openMagicLink(page: Page, link: string) {
  for (let attempt = 1; ; attempt++) {
    const response = await page.goto(link);
    if (response?.status() !== 429 || attempt === 3) return;
    test.info().setTimeout(test.info().timeout + 65_000);
    await page.waitForTimeout(61_000);
  }
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
  // Vérification faite : la page d'arrivée dépend du compte (administration, Mon compte…).
  await expect(page).not.toHaveURL(/\/connexion\//);
}

/** Saisit le code de l'application de démonstration sur la page de deuxième vérification. */
export async function enterDemoTotp(page: Page) {
  await page
    .getByRole("textbox", { name: "Code de l'application d'authentification" })
    .fill(totpCode(DEMO_TOTP_SECRET));
  await page.getByRole("button", { name: "Vérifier" }).click();
}
