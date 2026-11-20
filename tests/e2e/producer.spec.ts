import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { signInByEmail } from "./helpers/auth";

// Espace producteur, avec le compte de démonstration de « Les Ruches du Vallon », qui livre les
// deux AMAP du jeu de données (pnpm db:seed). Aucun autre fichier de test ne se sert de ce
// compte : deux connexions simultanées au même compte se prendraient leurs liens de connexion.
const PRODUCER_DEMO = "producteur.demo@example.org";

/**
 * Choisit l'AMAP courante dans la liste de l'accueil, au clavier : Entrée ouvre la liste,
 * Origine va à la première AMAP et la flèche vers le bas jusqu'à la bonne, Entrée la choisit. Rien à faire si elle l'est déjà (le choix est gardé
 * d'une exécution à l'autre). Pas de saisie du nom : l'espace choisirait l'option active.
 */
async function chooseAmap(page: Page, name: string) {
  const choice = page.getByRole("combobox", { name: "AMAP courante" });
  if ((await choice.textContent())?.includes(name)) return;
  await choice.focus();
  await page.keyboard.press("Enter");
  const option = page.getByRole("option", { name });
  await expect(option).toBeVisible();
  await page.keyboard.press("Home");
  for (
    let step = 0;
    step < 5 && !(await option.evaluate((el) => el === document.activeElement));
    step++
  ) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(option).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText(`Vous êtes maintenant sur ${name}.`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

/** Remplace le contenu d'un champ au clavier. */
async function type(page: Page, field: ReturnType<Page["getByRole"]>, text: string) {
  await field.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(text);
}

for (const path of ["/producteur", "/producteur/catalogue", "/producteur/paiements"]) {
  test(`un visiteur est renvoyé vers la connexion depuis ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/connexion$/);
  });
}

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
    await chooseAmap(page, "AMAP fictive du Pays d'Auge");
    await page
      .getByRole("navigation", { name: "Navigation de l'espace producteur" })
      .getByRole("link", { name: "Catalogue" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: /^Catalogue de / })).toBeVisible();
    await expect(page.getByText("Catalogue pour AMAP fictive du Pays d'Auge")).toBeVisible();
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

  test("un producteur choisit son AMAP courante au clavier et retrouve son choix (C4)", async ({
    page,
    request,
    browser,
  }) => {
    await signInByEmail(page, request, PRODUCER_DEMO);
    await page.goto("/producteur");
    const nav = page.getByRole("navigation", { name: "Navigation de l'espace producteur" });
    await expect(nav.getByRole("link", { name: "Accueil" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // D'abord la première AMAP, pour que le changement soit visible quel que soit l'état laissé
    // par une exécution précédente.
    await chooseAmap(page, "AMAP de démonstration de Cambremer");
    await chooseAmap(page, "AMAP fictive du Pays d'Auge");
    await expectNoSeriousA11yViolations(page);

    // Pas de période de commande dans cette AMAP : le catalogue est à publier avant
    // l'ouverture, sans date.
    const task = page.getByRole("region", { name: /^Votre catalogue de .* n'est pas publié$/ });
    await expect(task).toContainText("À faire avant l'ouverture des commandes");

    // Choix gardé avec le compte : retrouvé sur « un autre appareil » (nouveau navigateur).
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await signInByEmail(otherPage, request, PRODUCER_DEMO);
      await otherPage.goto("/producteur");
      await expect(
        otherPage.getByRole("heading", { level: 1, name: "AMAP fictive du Pays d'Auge" }),
      ).toBeVisible();
    } finally {
      await other.close();
    }

    // « Vérifier et publier » mène au catalogue de ce mois, dans cette AMAP.
    await task.getByRole("link", { name: "Vérifier et publier" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: /^Catalogue de / })).toBeVisible();
    await expect(page.getByText("Catalogue pour AMAP fictive du Pays d'Auge")).toBeVisible();
    await expect(nav.getByRole("link", { name: "Catalogue" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("l'accueil du producteur est accessible en mode sombre", async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signInByEmail(page, request, PRODUCER_DEMO);
    await page.goto("/producteur");
    await expect(page.getByRole("combobox", { name: "AMAP courante" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("le catalogue producteur est accessible en mode sombre", async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signInByEmail(page, request, PRODUCER_DEMO);
    await page.goto("/producteur/catalogue");
    await expect(page.getByRole("heading", { level: 1, name: /^Catalogue de / })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("le producteur voit au clavier ce qu'il doit préparer (E5), puis ses paiements (F4)", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, PRODUCER_DEMO);
    await page.goto("/producteur");
    // Jeu de données : à Cambremer, les commandes du mois en cours sont clôturées.
    await chooseAmap(page, "AMAP de démonstration de Cambremer");
    const nav = page.getByRole("navigation", { name: "Navigation de l'espace producteur" });
    await nav.getByRole("link", { name: "À préparer" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "À préparer" })).toBeVisible();

    const weeks = page.getByRole("tablist", { name: "Distributions" }).getByRole("tab");
    await expect(weeks.first()).toBeVisible();
    await expect(page.getByText(/^Distribution du /)).toBeVisible();
    const totals = page.getByRole("region", { name: "Totaux à préparer" });
    await expect(totals.getByRole("listitem").first()).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: /^Paniers? de \d+ foyers?$/ })
        .getByRole("heading", { level: 3 })
        .first(),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Une autre semaine, au clavier : sa propre adresse.
    if ((await weeks.count()) > 1) {
      const other = weeks.nth((await weeks.count()) - 1);
      await other.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/producteur\/a-preparer\?semaine=/);
      await expect(other).toHaveAttribute("aria-selected", "true");
    }

    // Puis ses paiements (F4), dans la même session : chaque connexion consomme un lien, et le
    // compte producteur est limité à 30 liens par quart d'heure (retries compris).
    await nav.getByRole("link", { name: "Paiements" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Mes paiements" })).toBeVisible();
    // Le mois affiché (le plus récent) ; d'autres mois peuvent suivre, selon les tests déjà
    // passés (« Autres mois »).
    await expect(page.getByText(/^\d+ \/ \d+ chèques reçus$/).first()).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Chèques reçus par votre référent" }),
    ).toBeVisible();
    await expect(page.getByText(/^Montant attendu : /)).toBeVisible();
    // Liste par foyer : les chèques à suivre, chacun avec son état.
    const toFollow = page.getByRole("region", { name: /^À suivre \(\d+\)$/ });
    await expect(toFollow.getByRole("listitem").first()).toContainText(/^Foyer .* · .*€/);
    await expect(toFollow.getByText("En attente").first()).toBeVisible();
    // Lecture seule : aucun champ ni case à cocher.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    // Et en mode sombre.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Mes paiements" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
