import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";

// Site public d'une AMAP (story H2), sans compte, avec les pages du jeu de données : accueil,
// blog (un billet publié, un brouillon), mentions légales.

test("un visiteur parcourt le site public au clavier : accueil, blog, billet, mentions légales", async ({
  page,
}) => {
  await page.goto("/hommesdeterre");
  await expect(
    page.getByRole("heading", { level: 1, name: "AMAP de démonstration de Cambremer" }),
  ).toBeVisible();
  // Blocs remplis automatiquement.
  await expect(page.getByRole("region", { name: "Prochaine distribution" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Nos producteurs" }).getByRole("listitem").first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Dernières nouvelles" })
      .getByText("Visite à la ferme d'essai"),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Le menu du site, au clavier.
  const menu = page.getByRole("navigation", { name: "Menu du site" });
  await menu.getByRole("link", { name: "Le blog" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/hommesdeterre\/blog$/);
  await expect(page.getByRole("heading", { level: 1, name: "Le blog" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Le blog" })).toHaveAttribute("aria-current", "page");
  const children = page.getByRole("region", { name: "À lire aussi" });
  await expect(children.getByText("Visite à la ferme d'essai")).toBeVisible();
  // Le brouillon n'apparaît pas.
  await expect(page.getByText("Fête de fin d'année")).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  await children.getByRole("link", { name: /Visite à la ferme d'essai/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/hommesdeterre\/blog\/visite-ferme-essai$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Visite à la ferme d'essai" }),
  ).toBeVisible();
  await expect(page.getByText(/^Publié le /)).toBeVisible();
  // Balises de partage : titre, description (le résumé) et nom du site.
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Visite à la ferme d'essai",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Une matinée au champ avec nos producteurs de légumes.",
  );
  await expect(page).toHaveTitle("Visite à la ferme d'essai · AMAP de démonstration de Cambremer");
  await expectNoSeriousA11yViolations(page);

  await page.getByRole("contentinfo").getByRole("link", { name: "Mentions légales" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mentions légales" })).toBeVisible();

  // Un brouillon n'existe pas pour un visiteur.
  await page.goto("/hommesdeterre/blog/fete-fin-annee");
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
});
