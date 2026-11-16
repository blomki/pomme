import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { signInByEmail } from "./helpers/auth";

// Espace producteur, avec le compte de démonstration de « Les Ruches du Vallon », qui livre les
// deux AMAP du jeu de données (pnpm db:seed). Aucun autre fichier de test ne se sert de ce
// compte : deux connexions simultanées au même compte se prendraient leurs liens de connexion.
const PRODUCER_DEMO = "producteur.demo@example.org";

/** Remplace le contenu d'un champ au clavier. */
async function type(page: Page, field: ReturnType<Page["getByRole"]>, text: string) {
  await field.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(text);
}

test("un visiteur est renvoyé vers la connexion depuis le catalogue producteur", async ({
  page,
}) => {
  await page.goto("/producteur/catalogue");
  await expect(page).toHaveURL(/\/connexion$/);
});

// Écrans de téléphone : sur le projet webkit-mobile seulement, l'un après l'autre (un seul
// compte producteur). Le refus d'un compte sans producteur est testé en intégration
// (tests/integration/catalogs.test.ts).
test.describe("espace producteur (téléphone)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ browserName }) => browserName !== "webkit", "écrans de téléphone");

  test("un producteur prépare le brouillon de son catalogue au clavier (C2)", async ({
    page,
    request,
  }) => {
    // Produit propre à chaque exécution : le ménage le laisse dans « Produits retirés ».
    const extra = `Miel de tilleul ${Date.now().toString(36)}, pot de 250 g`;
    await signInByEmail(page, request, PRODUCER_DEMO);
    await page.goto("/producteur");
    await page
      .getByRole("navigation", { name: "Navigation de l'espace producteur" })
      .getByRole("link", { name: "Catalogue" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: /^Catalogue de / })).toBeVisible();

    // Un onglet par AMAP livrée.
    const tabs = page.getByRole("tablist", { name: "Vos AMAP" });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await tabs.getByRole("tab", { name: "AMAP fictive du Pays d'Auge" }).click();
    await expect(page).toHaveURL(/amap=pays-d-auge-demo/);
    await expect(page.getByText("Brouillon · non visible des familles")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    const save = async () => {
      await page.getByRole("button", { name: "Enregistrer le brouillon" }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(/^Brouillon du catalogue de .* enregistré\.$/)).toBeVisible();
    };

    // Ajout d'un produit (Entrée l'ajoute), puis une semaine décochée.
    await type(
      page,
      page.getByRole("textbox", { name: "Produit et conditionnement", exact: true }),
      extra,
    );
    await type(page, page.getByRole("textbox", { name: "Prix (€)", exact: true }), "7,30");
    await page.keyboard.press("Enter");
    const price = page.getByRole("textbox", { name: `Prix en euros de ${extra}` });
    await expect(price).toHaveValue("7,30");
    const firstWeek = page
      .getByRole("group", { name: `Disponibilités de ${extra}` })
      .getByRole("checkbox")
      .first();
    await expect(firstWeek).toBeChecked();
    await firstWeek.focus();
    await page.keyboard.press("Space");
    await expect(firstWeek).not.toBeChecked();
    await save();

    // Après rechargement, tout est conservé.
    await page.reload();
    await expect(price).toHaveValue("7,30");
    await expect(firstWeek).not.toBeChecked();
    await expectNoSeriousA11yViolations(page);

    // Ménage : le produit ajouté est retiré de ce catalogue.
    await page.getByRole("button", { name: `Retirer ${extra} de ce catalogue` }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: /^Produits? retirés?/ })).toContainText(extra);
    await save();
  });

  test("le catalogue producteur est accessible en mode sombre", async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signInByEmail(page, request, PRODUCER_DEMO);
    await page.goto("/producteur/catalogue");
    await expect(page.getByRole("heading", { level: 1, name: /^Catalogue de / })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
