import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { ADMIN_DEMO, signInWithSecondFactor } from "./helpers/auth";

// Reprise des données depuis AmapJ (story K1). Fichier fictif (adresses @example.org), comme
// Excel l'enregistre en France : point-virgule, dates jj/mm/aaaa. Le test peut tourner plusieurs
// fois : au deuxième passage, les lignes sont « déjà présentes ».
const CSV = [
  "Nom;Prénom;E-mail;Tél;Foyer;Début adhésion;Fin adhésion;Permanences faites;Remarques",
  "Reprise;Camille;camille.reprise@example.org;06 98 76 54 32;Foyer Reprise Démo;01/09/2026;31/08/2027;8;",
  "Reprise;Dominique;dominique.reprise@example.org;;Foyer Reprise Démo;01/09/2026;31/08/2027;;",
  "Erreur;Sam;pas-un-email;;Foyer Erreur;;;;",
].join("\n");

test.describe("Reprise des données (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  test("un admin importe des foyers depuis un CSV, avec aperçu, au clavier (K1)", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/reglages");
    await page.getByRole("link", { name: "Reprendre des données depuis AmapJ" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Reprise des données" }),
    ).toBeVisible();

    // Type de données au clavier (flèches dans le groupe de boutons radio).
    const households = page.getByRole("radio", { name: /^Foyers et adhésions/ });
    await expect(households).toBeChecked();
    await households.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /^Producteurs/ })).toBeChecked();
    await page.keyboard.press("ArrowUp");
    await expect(households).toBeChecked();
    await expect(page.getByRole("link", { name: "Télécharger le modèle (CSV)" })).toBeVisible();

    await page.getByLabel("Fichier CSV").setInputFiles({
      name: "adherents-amapj.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV, "utf8"),
    });
    const preview = page.getByRole("button", { name: "Voir l'aperçu" });
    await preview.focus();
    await page.keyboard.press("Enter");

    const table = page.getByRole("table", { name: "Aperçu de l'import, ligne par ligne" });
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table.getByText("Email invalide : pas-un-email.")).toBeVisible();
    await expect(page.getByText("Colonnes ignorées : Remarques.")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Premier passage : import ; passages suivants : tout est déjà présent.
    const apply = page.getByRole("button", { name: /^Importer \d+ lignes?$/ });
    if (await apply.isEnabled()) {
      await apply.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(/^Import terminé : 2 lignes créées/)).toBeVisible();
    } else {
      await expect(table.getByText("Déjà présent")).toHaveCount(2);
    }

    // Le foyer est bien là, avec ses deux membres.
    await page.goto("/hommesdeterre/admin/foyers");
    await expect(page.getByRole("link", { name: "Foyer Reprise Démo" })).toBeVisible();
  });
});
