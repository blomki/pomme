import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { signInByEmail } from "./helpers/auth";
import { inboxSnapshot, newMessage } from "./helpers/mailpit";

// Commande du mois de la famille (story D3), sur téléphone, avec le jeu de données
// (pnpm db:seed) : commandes du mois prochain ouvertes dans la première AMAP, catalogues
// publiés sauf ceux que les tests C2 et C3 modifient. amapien.demo est adhérent,
// amapien2.demo ne l'est plus.
const FAMILY = "amapien.demo@example.org";
const EXPIRED = "amapien2.demo@example.org";
const ORDER = "/hommesdeterre/famille/commande";

/** Montant affiché (« 5,60 € ») en centimes. */
const cents = (text: string) =>
  Math.round(Number(text.replace(/[^\d,]/g, "").replace(",", ".")) * 100);

/** Remplace la valeur d'un champ numérique au clavier. */
async function typeQuantity(page: Page, field: ReturnType<Page["getByRole"]>, value: string) {
  await field.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(value);
}

test("un visiteur est renvoyé vers la connexion depuis la commande", async ({ page }) => {
  await page.goto(ORDER);
  await expect(page).toHaveURL(/\/connexion$/);
});

test.describe("commande du mois (téléphone)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ browserName }) => browserName !== "webkit", "écrans de téléphone");

  test("une famille commande au clavier, voit ses totaux en direct et valide (D3)", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, FAMILY);
    await page.goto(ORDER);
    await expect(page.getByRole("heading", { level: 1, name: /^Commande de / })).toBeVisible();
    await expect(page.getByText(/^\d+ producteurs sur \d+ traités$/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Chez la chèvrerie : quantité au clavier, flèche vers le haut.
    await page
      .getByRole("navigation", { name: "Producteurs" })
      .getByRole("link", { name: /^Chèvrerie des Hauts Prés/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Chèvrerie des Hauts Prés" }),
    ).toBeVisible();
    const product = page.getByRole("region", { name: "Crottin frais" });
    const fields = product.getByRole("spinbutton");
    const first = fields.first();
    // Point de départ connu : une exécution précédente a pu laisser des quantités.
    for (const field of await fields.all()) await typeQuantity(page, field, "0");
    await first.focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(first).toHaveValue("2");

    // Total du chèque calculé tout de suite : 2 × 2,80 €.
    const cheque = page.getByRole("status", { name: "Chèque pour ce producteur" });
    await expect.poll(async () => cents((await cheque.textContent()) ?? "")).toBe(560);
    await expect(page.getByText("Complété", { exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Même quantité chaque semaine, puis rechargement : tout est enregistré.
    await product
      .getByRole("button", { name: "Même quantité chaque semaine pour Crottin frais" })
      .click();
    const count = await fields.count();
    for (let i = 0; i < count; i++) await expect(fields.nth(i)).toHaveValue("2");
    // L'écran dit quand tout est enregistré : on peut alors recharger sans rien perdre.
    await expect(page.getByText("Modifications enregistrées")).toBeVisible();
    await expect.poll(async () => cents((await cheque.textContent()) ?? "")).toBe(560 * count);
    await page.reload();
    for (let i = 0; i < count; i++) await expect(fields.nth(i)).toHaveValue("2");

    // Chez la cidrerie : « Rien ce mois-ci » (sauf si une exécution précédente l'a déjà noté).
    await page.getByRole("link", { name: "Valider" }).click();
    await page
      .getByRole("navigation", { name: "Producteurs" })
      .getByRole("link", { name: /^Cidrerie du Clos Fictif/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Cidrerie du Clos Fictif" }),
    ).toBeVisible();
    const nothing = page.getByRole("button", { name: "Rien ce mois-ci", exact: true });
    if (await nothing.isVisible()) {
      await nothing.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByText("Noté : rien ce mois-ci chez Cidrerie du Clos Fictif."),
      ).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Annuler « Rien ce mois-ci »" })).toBeVisible();
    await page.getByRole("link", { name: "Valider" }).click();

    // Récapitulatif : un chèque par producteur commandé, ordre du chèque à la demande.
    await page.getByRole("link", { name: "Récapitulatif" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Récapitulatif" })).toBeVisible();
    const goat = page.getByRole("region", { name: "Chèvrerie des Hauts Prés" });
    await goat.getByRole("button", { name: "Voir l'ordre du chèque" }).click();
    await expect(goat.getByText(/^Chèque à l'ordre de /)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    const before = await inboxSnapshot(request, FAMILY);
    await page.getByRole("button", { name: "Valider ma commande" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: "Commande enregistrée" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    // Un seul email récapitulatif par mois : seulement à la première validation sur cette base.
    if (await page.getByText(/Un email récapitulatif vous a été envoyé\./).isVisible()) {
      const email = await newMessage(request, FAMILY, before);
      expect(email.Subject).toMatch(/votre commande de .* est enregistrée$/);
      expect(email.Text).toContain("Chèvrerie des Hauts Prés");
    }
  });

  test("sans adhésion en cours, la quantité saisie est refusée et revient à zéro (D3)", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, EXPIRED);
    await page.goto(ORDER);
    await expect(page.getByText(/Votre adhésion n'est pas en cours/)).toBeVisible();
    await page
      .getByRole("navigation", { name: "Producteurs" })
      .getByRole("link", { name: /^Chèvrerie des Hauts Prés/ })
      .click();
    const first = page
      .getByRole("region", { name: "Crottin frais" })
      .getByRole("spinbutton")
      .first();
    await first.focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByText(/^Votre adhésion n'est pas en cours : la quantité/)).toBeVisible();
    await expect(first).toHaveValue("0");
    await expectNoSeriousA11yViolations(page);
  });

  test("l'accueil montre où en est la commande et mène à la commande et aux chèques (D6)", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, FAMILY);
    await page.goto("/hommesdeterre/famille");
    await expect(page.getByRole("heading", { level: 1, name: "Espace famille" })).toBeAttached();
    const nav = page.getByRole("navigation", { name: "Navigation de l'espace famille" });
    await expect(nav.getByRole("link", { name: "Accueil" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Jeu de données : commandes ouvertes ; le test D3 vient de commander.
    const card = page.getByRole("region", { name: /^Commande de / });
    await expect(card.getByText(/^Commandes ouvertes · jusqu'au /)).toBeVisible();
    await expect(card.getByText(/^\d+ chèques? · .* · modifiable jusqu'au /)).toBeVisible();
    const next = page.getByRole("region", { name: "Prochaine distribution" });
    await expect(next.getByRole("link", { name: "Signaler un problème" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // « Liste des chèques » pendant les commandes : le récapitulatif.
    await card.getByRole("link", { name: "Liste des chèques" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Récapitulatif" })).toBeVisible();
    await page.goBack();
    await card.getByRole("link", { name: "Modifier ma commande" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Commande de / })).toBeVisible();
  });

  test("l'accueil rappelle une adhésion qui n'est plus en cours (D6)", async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signInByEmail(page, request, EXPIRED);
    await page.goto("/hommesdeterre/famille");
    await expect(page.getByText(/^Votre adhésion n'est pas en cours/)).toBeVisible();
    await expect(
      page.getByRole("region", { name: /^Commande de / }).getByRole("link", {
        name: "Passer ma commande",
      }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    // Barre du bas : les chèques, pendant les commandes, renvoient au récapitulatif.
    await page
      .getByRole("navigation", { name: "Navigation de l'espace famille" })
      .getByRole("link", { name: "Chèques" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Liste des chèques" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir le récapitulatif" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("une famille signale au clavier un produit abîmé, et suit son signalement (F5)", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, FAMILY);
    await page.goto("/hommesdeterre/famille/signalement");
    await expect(
      page.getByRole("heading", { level: 1, name: "Signaler un problème" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Produit : le premier de la liste (une distribution passée), au clavier.
    const product = page.getByRole("combobox", { name: "Produit" });
    await expect(product).toHaveText(/ · .* \(× \d+\) · /);
    const chosen = (await product.textContent())!;
    const productName = / · (.*) \(×/.exec(chosen)![1]!;

    // Motif « Autre » sans précision : refusé, avec un message clair.
    await page.getByRole("radio", { name: "Autre" }).focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Envoyer le signalement" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Pour « Autre », précisez le problème.")).toBeVisible();

    // Produit abîmé, une unité.
    await page.getByRole("radio", { name: "Produit abîmé" }).focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Envoyer le signalement" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^Signalement envoyé au référent de /)).toBeVisible();
    const mine = page.getByRole("region", { name: "Mes signalements" });
    await expect(mine.getByText(`${productName} × 1 · `).first()).toBeVisible();
    await expect(mine.getByText("En attente").first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("une famille consulte sa liste de chèques, l'ordre à la demande, et l'imprime (E2)", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, FAMILY);
    await page.goto("/hommesdeterre/famille/cheques");
    await expect(page.getByRole("heading", { level: 1, name: "Liste des chèques" })).toBeVisible();
    // Jeu de données : le mois en cours est clôturé (chèques), le suivant est ouvert.
    await expect(page.getByText(/^Commande de /)).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir le récapitulatif" })).toBeVisible();
    const first = page.getByRole("main").getByRole("region").first();
    const toggle = first.getByRole("button", { name: "Voir l'ordre du chèque" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(first.getByText(/^(À l'ordre de |Ordre du chèque : )/)).toBeHidden();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(first.getByRole("button", { name: "Masquer l'ordre du chèque" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(first.getByText(/^(À l'ordre de |Ordre du chèque : )/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimer la liste" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Version imprimée : ni menu ni bouton, et l'ordre de chaque chèque.
    await page.emulateMedia({ media: "print" });
    await expect(
      page.getByRole("navigation", { name: "Navigation de l'espace famille" }),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: "Imprimer la liste" })).toBeHidden();
    await expect(
      page.getByText("Foyer Démo (Sasha) · AMAP de démonstration de Cambremer"),
    ).toBeVisible();
    const regions = page.getByRole("main").getByRole("region");
    const count = await regions.count();
    for (let i = 0; i < count; i++) {
      const region = regions.nth(i);
      if ((await region.getAttribute("aria-labelledby")) === "rien-ce-mois-ci") continue;
      await expect(region.getByText(/^(À l'ordre de |Ordre du chèque : )/)).toBeVisible();
    }
    await page.emulateMedia({ media: "screen" });
  });
});
