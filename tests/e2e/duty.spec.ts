import { expect, test } from "@playwright/test";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { ADMIN_DEMO, signInByEmail, signInWithSecondFactor } from "./helpers/auth";

// Indisponibilités du trimestre (story G1), avec le jeu de données (pnpm db:seed) : la période
// de réponse du prochain trimestre est ouverte dans la première AMAP ; 8 amapiens ont répondu,
// pas les comptes de démonstration. Le test peut tourner plusieurs fois sur la même base : la
// réponse de amapien.demo est alors déjà enregistrée.
const FAMILY = "amapien.demo@example.org";

test.describe("Mes disponibilités (téléphone)", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "écran de téléphone");

  test("un amapien déclare ses indisponibilités au clavier depuis l'accueil (G1)", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, FAMILY);
    await page.goto("/hommesdeterre/famille");
    const card = page.getByRole("region", { name: /^Vos disponibilités pour / });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: /mes disponibilités$/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mes disponibilités" })).toBeVisible();

    // Déjà répondu lors d'un passage précédent : on repasse en modification.
    const edit = page.getByRole("button", { name: "Modifier" });
    if (await edit.isVisible()) await edit.click();

    // Une seule date cochée, au clavier.
    const boxes = page.getByRole("checkbox");
    const total = await boxes.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      if (await boxes.nth(i).isChecked()) {
        await boxes.nth(i).focus();
        await page.keyboard.press("Space");
      }
    }
    await boxes.first().focus();
    await page.keyboard.press("Space");
    await expect(boxes.first()).toBeChecked();
    await expect(page.getByText(`1 distribution sur ${total}`)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: /^(Envoyer|Enregistrer)$/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").getByText(/^Réponse enregistrée\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifier" })).toBeVisible();

    // L'accueil le montre.
    await page.goto("/hommesdeterre/famille");
    await expect(page.getByText("1 indisponibilité déclarée.", { exact: false })).toBeVisible();
  });
});

test.describe("Disponibilités du trimestre (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  test("un admin suit les réponses, filtre et relance une personne au clavier (G1)", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/planning");
    await page
      .getByRole("region", { name: "Prochain trimestre" })
      .getByRole("link", { name: "Voir les réponses" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: /^Disponibilités · .* \d{4}$/ }),
    ).toBeVisible();
    await expect(page.getByText(/^\d+ amapiens sur \d+ ont répondu$/).first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    const table = page.getByRole("table", { name: "Réponses des amapiens" });
    await page.getByRole("button", { name: /^Sans réponse \(\d+\)$/ }).click();
    await expect(table.getByText("Répondu le", { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: /^Ont répondu \(\d+\)$/ }).click();
    await expect(table.getByText("Sans réponse")).toHaveCount(0);
    await page.getByRole("button", { name: /^Tous \(\d+\)$/ }).click();

    // Relance individuelle de Dominique (admin2.demo, sans réponse), au clavier.
    const remind = page.getByRole("button", { name: "Relancer Dominique Démo" });
    await remind.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(/^(1 relance envoyée\.|Aucun email envoyé \(déjà relancé aujourd'hui\)\.)$/),
    ).toBeVisible();
  });
});

test.describe("Planning des permanences (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écran d'ordinateur");

  test("un admin génère le planning, l'ajuste au clavier et prévient les personnes (G2)", async ({
    page,
    request,
  }) => {
    /**
     * Change au clavier la 1re case de la 1re distribution : la vide (touche Début : « — personne
     * — ») si elle est occupée, sinon la remplit (touche Fin, puis Haut tant que la personne est
     * déjà sur la ligne). Le test peut ainsi repasser sur la même base sans l'épuiser.
     */
    const changeASlot = async (table: ReturnType<typeof page.getByRole>) => {
      const row = table.getByRole("row").nth(1).getByRole("combobox");
      const first = row.first();
      await first.focus();
      if ((await first.inputValue()) !== "") {
        await page.keyboard.press("Home");
        await expect(first).toHaveValue("");
        return;
      }
      await page.keyboard.press("End");
      const others = async () => Promise.all([1, 2].map((k) => row.nth(k).inputValue()));
      while ((await others()).includes(await first.inputValue())) {
        await page.keyboard.press("ArrowUp");
      }
      await expect(first).not.toHaveValue("");
    };

    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/planning");
    const banner = page.getByRole("region", { name: "Prochain trimestre" });
    await expect(banner.getByText(/amapiens sur \d+ ont répondu/)).toBeVisible();
    await banner
      .getByRole("link", { name: /^(Générer le planning|Voir et éditer le planning)$/ })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: /^Permanences · / })).toBeVisible();

    // Prochain trimestre : génération (ou regénération du brouillon), au clavier.
    const generate = page.getByRole("button", { name: /^(Générer le planning|Regénérer)$/ });
    await generate.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Planning généré.")).toBeVisible();
    const table = page.getByRole("table", { name: /^Bénévoles de / });
    await expect(table.getByRole("combobox").first()).toBeVisible();
    await expect(page.getByText(/^Équité : /)).toBeVisible();
    // Les boutons, désactivés pendant la génération, changent de couleur en 250 ms : axe ne
    // doit pas mesurer le contraste au milieu de cette transition.
    const send = page.getByRole("button", { name: "Envoyer le planning aux bénévoles" });
    await expect(send).toBeEnabled();
    await expect.poll(() => send.evaluate((el) => el.getAnimations().length)).toBe(0);
    await expectNoSeriousA11yViolations(page);

    // Une case changée au clavier, puis le brouillon enregistré.
    await changeASlot(table);
    await page.getByRole("button", { name: "Enregistrer le brouillon" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Brouillon enregistré.")).toBeVisible();

    // Trimestre en cours, déjà envoyé : un changement enregistré sans prévenir.
    await page.getByRole("link", { name: "Trimestre en cours" }).click();
    await expect(page.getByText(/^Planning envoyé le /)).toBeVisible();
    const current = page.getByRole("table", { name: /^Bénévoles de / });
    await changeASlot(current);
    await expect(page.getByText("Modifications non enregistrées.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Prévenir les personnes concernées" }).uncheck();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Changements enregistrés sans prévenir.")).toBeVisible();

    // Le bandeau propose de prévenir maintenant.
    const pending = page
      .getByRole("status")
      .filter({ hasText: "Changements enregistrés sans prévenir :" });
    await expect(pending).toBeVisible();
    // Contrôle d'accessibilité sur la page telle qu'on la retrouve (rechargée), pas pendant sa
    // mise à jour sur place après l'enregistrement.
    await page.reload();
    // Page entièrement mise en place (tableau affiché, polices chargées) avant de mesurer.
    await expect(current.getByRole("combobox").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // Le navigateur garde la position de défilement : remonté en haut, aucune ligne du tableau
    // n'est à moitié cachée sous la barre du haut (axe la compterait comme cible trop petite).
    await page.evaluate(() => window.scrollTo(0, 0));
    const notifyNow = pending.getByRole("button", { name: "Prévenir maintenant" });
    await expect.poll(() => notifyNow.evaluate((el) => el.getAnimations().length)).toBe(0);
    await expectNoSeriousA11yViolations(page);
    await pending.getByRole("button", { name: "Prévenir maintenant" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/personnes? prévenues?\.$/)).toBeVisible();
    await expect(pending).toBeHidden();
  });
});
