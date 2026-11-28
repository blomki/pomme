import { execFileSync } from "node:child_process";
import { text } from "node:stream/consumers";

import { expect, test } from "@playwright/test";

import { totpFromBase32 } from "../helpers/totp";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { countMessagesTo, inboxSnapshot, newMessage } from "./helpers/mailpit";
import {
  ADMIN_DEMO,
  enrollTotp,
  enterDemoTotp,
  PLATFORM_ADMIN_DEMO,
  signInByEmail,
  signInWithSecondFactor,
} from "./helpers/auth";

// Espaces réservés et deuxième vérification (story A1), avec les comptes de démonstration.

test("un visiteur est renvoyé vers la connexion", async ({ page }) => {
  await page.goto("/hommesdeterre/admin");
  await expect(page).toHaveURL(/\/connexion$/);
  await page.goto("/plateforme");
  await expect(page).toHaveURL(/\/connexion$/);
});

test("un référent arrive sur son tableau de bord, avec le menu", async ({ page, request }) => {
  await signInWithSecondFactor(page, request, "referent.demo@example.org");
  await page.goto("/hommesdeterre/referent");
  await expect(page).toHaveURL(/\/hommesdeterre\/referent$/);
  // Sur téléphone, le menu est replié derrière un bouton (S14).
  const toggle = page.getByRole("button", { name: "Ouvrir le menu de navigation" });
  const folded = await toggle.isVisible();
  if (folded) await toggle.click();
  const menu = page.getByRole("navigation", { name: "Navigation référent" });
  await expect(menu.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Référent et membre d'un foyer : le bouton « Mode » propose ces deux modes, pas
  // l'administration (S14). Sur téléphone, il est en tête du menu replié (fiche #126).
  await page.getByRole("button", { name: "Mode référent" }).click();
  await expect(page.getByRole("menuitem", { name: "Mode consomm'acteur" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Mode administrateur" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  if (folded) await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Mon compte" }).click();
  await expect(page.getByRole("link", { name: /— Référent$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /— Mon foyer$/ })).toBeVisible();
});

test("un référent sans deuxième vérification est invité à l'activer avant son espace (S10)", async ({
  page,
  request,
}) => {
  await signInByEmail(page, request, "referent2.demo@example.org");
  await expect(
    page.getByRole("heading", { level: 1, name: "Sécurisez votre compte" }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  // Pas d'espace référent tant qu'aucun moyen n'est enregistré.
  await page.goto("/hommesdeterre/referent/cheques");
  await expect(page).toHaveURL(/\/connexion\/verification\?retour=/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sécurisez votre compte" }),
  ).toBeVisible();
});

test("un référent n'a pas accès à l'administration", async ({ page, request }) => {
  await signInWithSecondFactor(page, request, "referent.demo@example.org");
  await page.goto("/hommesdeterre/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
});

// Administration et plateforme : écrans d'ordinateur (Chromium). Les tests ci-dessous
// partagent les comptes admin.demo et admin2.demo : ils tournent l'un après l'autre, dans ce
// fichier seulement, pour qu'aucun ne prenne le lien de connexion d'un autre.
test.describe("administration (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écrans d'ordinateur");

  test("un admin passe la deuxième vérification au clavier, puis accède à l'administration", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, ADMIN_DEMO);
    await expect(page).toHaveURL(/\/connexion\/verification\?retour=/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Deuxième vérification" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Code faux : message d'erreur, toujours sur la page.
    const code = page.getByRole("textbox", { name: "Code de l'application d'authentification" });
    await code.focus();
    await page.keyboard.type("000000");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Ce code n'est pas le bon/)).toBeVisible();

    await page.goto("/hommesdeterre/admin");
    await expect(page).toHaveURL(/\/connexion\/verification\?retour=%2Fhommesdeterre%2Fadmin$/);
    await enterDemoTotp(page);
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Administration de l'AMAP" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("le menu latéral et le bouton « Mode » mènent de l'administration au référent et retour", async ({
    page,
    request,
  }) => {
    // admin.demo est aussi référent : il arrive dans l'administration, et passe d'un espace
    // à l'autre avec le sélecteur.
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
    await page.getByRole("button", { name: "Mode administrateur" }).click();
    await page.getByRole("menuitem", { name: "Mode référent" }).click();
    await expect(page).toHaveURL(/\/hommesdeterre\/referent$/);
    const menu = page.getByRole("navigation", { name: "Navigation référent" });
    await expect(menu.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Au clavier : le menu s'ouvre avec Entrée, se parcourt avec les flèches.
    await page.getByRole("button", { name: "Mode référent" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Mode administrateur" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Mode administrateur" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
    await expect(page.getByRole("navigation", { name: "Navigation administrateur" })).toBeVisible();
  });

  test("le gestionnaire crée une AMAP, puis réinitialise la deuxième vérification de son admin (J1, S10b)", async ({
    page,
    request,
    browser,
  }) => {
    // Deux parcours à la suite (J1 puis S10b, qui réutilise l'admin créé) : plus de temps.
    test.slow();
    await signInWithSecondFactor(page, request, PLATFORM_ADMIN_DEMO);
    await page.goto("/plateforme");
    await expect(
      page.getByRole("heading", { level: 1, name: "Gestion de la plateforme" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Créer une AMAP au clavier (J1), dans la même session : l'adresse suit le nom.
    const token = Date.now().toString(36);
    const name = `AMAP d'essai ${token}`;
    const adminEmail = `admin.${token}@example.org`;
    await page.getByRole("link", { name: "Créer une AMAP" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Créer une AMAP" })).toBeVisible();
    const typeIn = async (label: string | RegExp, text: string) => {
      const field = page.getByRole("textbox", { name: label });
      await field.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(text);
    };
    await typeIn(/^Nom de l'AMAP/, name);
    await expect(page.getByRole("textbox", { name: /^Adresse$/ })).toHaveValue(
      `amap-d-essai-${token}`,
    );
    await typeIn(/^Lieu de distribution/, "Salle des fêtes d'essai");
    await typeIn(/^Adresse email$/, adminEmail);
    await typeIn(/^Prénom/, "Dominique");

    // Aperçu du thème, en clair et en sombre, recalculé à chaque couleur ; contraste vérifié.
    const preview = page.getByRole("region", { name: "Aperçu du thème" });
    await expect(preview.getByRole("figure", { name: "Clair" })).toBeVisible();
    await expect(preview.getByRole("figure", { name: "Sombre" })).toBeVisible();
    const button = preview.getByRole("figure", { name: "Clair" }).getByText("Commander");
    const before = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    await typeIn(/^Couleur principale/, "#3f6fb5");
    await expect
      .poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(before);
    await expect(preview.getByRole("status")).toContainText("Contraste vérifié");
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: "Créer l'AMAP et inviter l'administrateur" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(`AMAP « ${name} » créée. L'invitation est partie à ${adminEmail}.`),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Gestion de la plateforme" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "AMAP de la plateforme" }).getByText(name),
    ).toBeVisible();
    // L'invitation est arrivée.
    await expect.poll(() => countMessagesTo(request, adminEmail)).toBe(1);

    // S10b : le seul admin de cette AMAP a perdu son téléphone. Le gestionnaire retrouve son
    // compte et réinitialise sa deuxième vérification. Un compte créé par ce test : aucun autre
    // test n'est déconnecté.
    await page
      .getByRole("navigation", { name: "Navigation de la plateforme" })
      .getByRole("link", { name: "Comptes" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Comptes" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    const emailField = page.getByRole("textbox", { name: "Adresse email du compte" });

    // Le compte d'un gestionnaire ne se réinitialise pas ainsi.
    await emailField.fill(PLATFORM_ADMIN_DEMO);
    await emailField.press("Enter");
    await expect(page.getByText(/^Compte d'un gestionnaire de la plateforme/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Réinitialiser la deuxième vérification" }),
    ).toHaveCount(0);

    // Pas encore de moyen de vérification : rien à réinitialiser, pas de bouton (fiche #125).
    await emailField.fill(adminEmail);
    await emailField.press("Enter");
    const account = page.getByRole("region", { name: "Dominique" });
    await expect(account).toContainText(`AMAP : ${name}`);
    await expect(account).toContainText("Deuxième vérification : aucune pour l'instant.");
    const resetButton = account.getByRole("button", {
      name: "Réinitialiser la deuxième vérification",
    });
    await expect(resetButton).toHaveCount(0);

    // L'admin se connecte (autre navigateur) et active son application d'authentification.
    const adminPage = await browser.newPage();
    await signInByEmail(adminPage, request, adminEmail);
    await enrollTotp(adminPage);
    await adminPage.close();

    await emailField.press("Enter");
    await resetButton.click();
    const dialog = page.getByRole("dialog", {
      name: "Réinitialiser la deuxième vérification de Dominique ?",
    });
    await expect(dialog).toContainText("journal de la plateforme");
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    await dialog.getByRole("button", { name: "Réinitialiser" }).click();
    await expect(page.getByText("Deuxième vérification de Dominique réinitialisée.")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(account).toContainText("Deuxième vérification : aucune pour l'instant.");
    // Plus rien à réinitialiser : le bouton disparaît aussitôt (fiche #125).
    await expect(resetButton).toHaveCount(0);
  });

  test("un nouvel admin active l'application d'authentification et note ses codes", async ({
    page,
    request,
  }) => {
    await signInByEmail(page, request, "admin2.demo@example.org");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sécurisez votre compte" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: "Activer l'application d'authentification" }).click();
    await expect(
      page.getByRole("img", { name: "QR code à scanner avec l'application d'authentification" }),
    ).toBeVisible();
    const backupCodes = page.getByRole("region", { name: "2. Notez vos codes de secours" });
    await expect(backupCodes.getByRole("listitem")).toHaveCount(10);
    await expectNoSeriousA11yViolations(page);

    const key = (await page.locator("code").textContent()) ?? "";
    await page.getByRole("textbox", { name: "Code à 6 chiffres" }).fill(totpFromBase32(key));
    await page.getByRole("button", { name: "Confirmer" }).click();

    // La session est vérifiée : arrivée directement dans l'administration.
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Administration de l'AMAP" }),
    ).toBeVisible();

    // Ménage : le compte doit rester sans moyen de vérification pour la prochaine fois (sinon
    // chaque nouvel essai échoue). Un clic avant que la page ne soit prête est perdu : on
    // recommence tant que l'application n'est pas désactivée.
    await page.goto("/compte/securite");
    const disable = page.getByRole("button", { name: "Désactiver l'application" });
    const enable = page.getByRole("button", { name: "Activer l'application d'authentification" });
    await expect(async () => {
      if (await disable.isVisible()) await disable.click();
      await expect(enable).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  });

  test("un admin corrige l'email d'un membre depuis la fiche de son foyer", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/foyers");
    await page.getByRole("link", { name: "Foyer Démo (Dominique)" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Foyer Démo (Dominique)" }),
    ).toBeVisible();

    // admin2.demo : aucun autre fichier de test ne s'en sert.
    const correct = async (from: string, to: string) => {
      await page.getByRole("button", { name: "Corriger l'email de Dominique Démo" }).click();
      const dialog = page.getByRole("dialog", { name: "Corriger l'email de Dominique Démo" });
      const field = dialog.getByRole("textbox", { name: "Nouvelle adresse email" });
      await expect(field).toHaveValue(from);
      await field.fill(to);
      await dialog.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Email de Dominique Démo corrigé.")).toBeVisible();
      await expect(page.getByRole("cell", { name: to })).toBeVisible();
    };

    await correct("admin2.demo@example.org", "dominique.nouvelle@example.org");
    // Ménage : on remet l'adresse de démonstration.
    await correct("dominique.nouvelle@example.org", "admin2.demo@example.org");
  });

  test("un admin réinitialise la deuxième vérification d'un référent, avec confirmation (S10)", async ({
    page,
    request,
    browser,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    const openHousehold = async () => {
      await page.goto("/hommesdeterre/admin/foyers");
      await page.getByRole("link", { name: "Foyer Démo (Lou)" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Foyer Démo (Lou)" })).toBeVisible();
    };
    const resetLou = page.getByRole("button", {
      name: "Réinitialiser la deuxième vérification de Lou Démo",
    });

    // referent2.demo n'a pas de moyen de vérification : rien à réinitialiser (fiche #125). Sur
    // sa propre ligne, l'admin n'a pas le bouton non plus.
    await openHousehold();
    await expect(resetLou).toHaveCount(0);

    // Lou active son application d'authentification (autre navigateur) : le bouton apparaît.
    const louPage = await browser.newPage();
    await signInByEmail(louPage, request, "referent2.demo@example.org");
    await enrollTotp(louPage);
    await louPage.close();
    await openHousehold();
    await resetLou.click();
    const dialog = page.getByRole("dialog", {
      name: "Réinitialiser la deuxième vérification de Lou Démo ?",
    });
    await expect(dialog).toContainText("inscrite au journal");
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    await dialog.getByRole("button", { name: "Réinitialiser" }).click();
    await expect(page.getByText("Deuxième vérification de Lou Démo réinitialisée.")).toBeVisible();
    await expect(dialog).toBeHidden();
    // Plus rien à réinitialiser : le bouton disparaît sans recharger la page. Lou retrouve
    // aussi l'état du jeu de données (sans moyen de vérification) pour les passages suivants.
    await expect(resetLou).toHaveCount(0);
  });

  test("un admin choisit les producteurs suivis par un référent, avec avertissement (#138)", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/foyers");
    await page.getByRole("link", { name: "Foyer Moreau (Sacha)" }).click();
    const open = page.getByRole("button", { name: "Modifier les rôles de Sacha Moreau" });
    await open.click();
    const dialog = page.getByRole("dialog", { name: "Rôles de Sacha Moreau" });
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");

    // Une case par producteur actif, au nom complet ; ceux que Sacha suit sont cochés, en tête.
    const boxes = dialog.getByRole("checkbox");
    await expect(boxes.nth(0)).toHaveAccessibleName("Administrateur");
    await expect(boxes.nth(1)).toHaveAccessibleName("Référent : Chèvrerie des Hauts Prés");
    await expect(boxes.nth(1)).toBeChecked();
    await expect(
      dialog.getByRole("checkbox", { name: "Référent : Les Ruches du Vallon" }),
    ).not.toBeChecked();
    await expectNoSeriousA11yViolations(page);

    // Seul référent de la chèvrerie : la décocher l'annonce avant tout enregistrement.
    await boxes.nth(1).focus();
    await page.keyboard.press("Space");
    await expect(
      dialog.getByText(
        "Chèvrerie des Hauts Prés n'aura plus de référent : personne ne pointera ses chèques.",
      ),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // « Annuler » n'enregistre rien.
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    await open.click();
    await expect(
      dialog.getByRole("checkbox", { name: "Référent : Chèvrerie des Hauts Prés" }),
    ).toBeChecked();
    await dialog.getByRole("button", { name: "Annuler" }).click();
  });

  test("un admin invite un foyer au clavier, lui donne un rôle, puis l'archive (A2)", async ({
    page,
    request,
  }) => {
    // Adresses et nom uniques à chaque passage : la base garde les foyers des passages précédents.
    const run = Date.now().toString(36);
    const first = `claude.${run}@example.org`;
    const second = `alex.${run}@example.org`;
    const name = `Foyer Essai ${run}`;

    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin");
    await page
      .getByRole("navigation", { name: "Navigation administrateur" })
      .getByRole("link", { name: "Foyers et adhésions" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Foyers et adhésions" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("link", { name: "Inviter un foyer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Inviter un foyer" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Saisie au clavier seul.
    const type = async (field: ReturnType<typeof page.getByRole>, text: string) => {
      await field.focus();
      await page.keyboard.type(text);
    };
    await type(page.getByRole("textbox", { name: "Nom du foyer" }), name);
    const member1 = page.getByRole("group", { name: "Membre 1" });
    await type(member1.getByRole("textbox", { name: "Adresse email" }), first);
    await type(member1.getByRole("textbox", { name: "Prénom" }), "Claude");
    await type(member1.getByRole("textbox", { name: "Nom", exact: true }), "Essai");
    await type(member1.getByRole("textbox", { name: "Téléphone" }), "06 39 98 99 01");

    await page.getByRole("button", { name: "Ajouter un membre" }).focus();
    await page.keyboard.press("Enter");
    const member2 = page.getByRole("group", { name: "Membre 2" });
    await type(member2.getByRole("textbox", { name: "Adresse email" }), second);
    await type(member2.getByRole("textbox", { name: "Prénom" }), "Alex");
    await member2.getByRole("radio", { name: "Contact principal du foyer" }).focus();
    await page.keyboard.press("Space");

    // Téléphone invalide : message près du champ, rien n'est perdu.
    await member1.getByRole("textbox", { name: "Téléphone" }).fill("12");
    const before = await inboxSnapshot(request, first);
    await page.getByRole("button", { name: "Créer le foyer et envoyer les invitations" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#contenu").getByRole("alert")).toContainText(
      "Le foyer n'a pas été créé",
    );
    await expect(member1.getByText("Ce numéro n'est pas valide.")).toBeVisible();
    await expect(member2.getByRole("textbox", { name: "Prénom" })).toHaveValue("Alex");
    await expectNoSeriousA11yViolations(page);

    await member1.getByRole("textbox", { name: "Téléphone" }).fill("06 39 98 99 01");
    await page.getByRole("button", { name: "Créer le foyer et envoyer les invitations" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText(`Foyer « ${name} » créé, invitations envoyées.`)).toBeVisible();
    await expect(page.getByRole("cell", { name: "06 39 98 99 01" })).toBeVisible();
    await expect(page.getByText("Invité")).toHaveCount(2);
    await expectNoSeriousA11yViolations(page);

    // L'invitation mène à la page de connexion, adresse remplie, sans lien de connexion.
    const invitation = await newMessage(request, first, before);
    expect(invitation.Subject).toContain("votre compte sur Pomme");
    expect(invitation.Text).not.toMatch(/magic-link/);
    const loginUrl = invitation.Text.match(/https?:\/\/\S+\/connexion\?email=\S+/)?.[0] ?? "";
    expect(loginUrl).not.toBe("");

    // Rôle référent pour Claude, journalisé côté serveur.
    await page.getByRole("button", { name: "Modifier les rôles de Claude Essai" }).click();
    const dialog = page.getByRole("dialog", { name: "Rôles de Claude Essai" });
    // Contrôle une fois le fondu d'ouverture terminé (sinon le texte est encore transparent).
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    // Référent d'un producteur (fiche #138) : la case porte le nom du producteur.
    const ruches = dialog.getByRole("checkbox", { name: "Référent : Les Ruches du Vallon" });
    await ruches.check();
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Rôles de Claude Essai mis à jour.")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("cell", { name: "Référent" })).toBeVisible();
    // Ménage : Claude ne suit plus les Ruches avant l'archivage du foyer.
    await page.getByRole("button", { name: "Modifier les rôles de Claude Essai" }).click();
    await ruches.uncheck();
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("cell", { name: "Référent" })).toHaveCount(0);

    // Archivage, annulation, puis archivage pour de bon (ménage).
    await page.getByRole("button", { name: "Archiver le foyer" }).click();
    await expect(page.getByText(`Foyer « ${name} » archivé.`)).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByText(`Foyer « ${name} » rétabli.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Archiver le foyer" })).toBeVisible();
    await page.getByRole("button", { name: "Archiver le foyer" }).click();
    await expect(page.getByRole("button", { name: "Rétablir le foyer" })).toBeVisible();

    // L'invitation ouvre la page de connexion avec l'adresse déjà remplie.
    await page.context().clearCookies();
    await page.goto(loginUrl);
    await expect(page.getByRole("textbox", { name: "Adresse email" })).toHaveValue(first);
  });

  test("un admin exporte les données d'un foyer puis l'anonymise (RGPD)", async ({
    page,
    request,
  }) => {
    const run = Date.now().toString(36);
    const email = `rgpd.${run}@example.org`;
    const name = `Foyer Rgpd ${run}`;

    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/foyers/nouveau");
    await page.getByRole("textbox", { name: "Nom du foyer" }).fill(name);
    const member = page.getByRole("group", { name: "Membre 1" });
    await member.getByRole("textbox", { name: "Adresse email" }).fill(email);
    await member.getByRole("textbox", { name: "Prénom" }).fill("Rémi");
    await page.getByRole("button", { name: "Créer le foyer et envoyer les invitations" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    // Export : un fichier JSON avec les données du foyer.
    // Au clavier : le message « Foyer créé » peut recouvrir le lien en bas de l'écran.
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exporter les données (JSON)" }).focus();
    await page.keyboard.press("Enter");
    const download = await downloading;
    const exported = JSON.parse(await text(await download.createReadStream())) as {
      household: { name: string };
      members: Array<{ email: string }>;
    };
    expect(exported.household.name).toBe(name);
    expect(exported.members.map((m) => m.email)).toEqual([email]);

    // Anonymisation : confirmation par le nom du foyer, au clavier.
    await page.getByRole("button", { name: "Anonymiser le foyer" }).click();
    const dialog = page.getByRole("dialog", { name: `Anonymiser « ${name} » ?` });
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    const confirm = dialog.getByRole("textbox", { name: /Pour confirmer, tapez le nom du foyer/ });
    await confirm.focus();
    await page.keyboard.type("Autre nom");
    await page.keyboard.press("Enter");
    await expect(dialog.getByText("Le nom tapé ne correspond pas au nom du foyer.")).toBeVisible();
    await confirm.fill("");
    await page.keyboard.type(name.toLowerCase());
    await page.keyboard.press("Enter");
    await expect(page.getByText("Foyer anonymisé.")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Foyers et adhésions" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  });

  test("un admin modifie les réglages de son AMAP au clavier (A4)", async ({ page, request }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin");
    await page
      .getByRole("navigation", { name: "Navigation administrateur" })
      .getByRole("link", { name: "Réglages" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Réglages de l'AMAP" })).toBeVisible();
    // L'adresse ne se change pas ici.
    await expect(page.getByRole("textbox", { name: "Adresse" })).not.toBeEditable();
    const preview = page.getByRole("region", { name: "Aperçu du thème" });
    await expect(preview.getByRole("figure", { name: "Clair" })).toBeVisible();
    await expect(preview.getByRole("figure", { name: "Sombre" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Un paramètre hors bornes est refusé, puis une valeur correcte est enregistrée.
    const volunteers = page.getByRole("spinbutton", { name: "Bénévoles par distribution" });
    const setVolunteers = async (value: string) => {
      await volunteers.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(value);
      await page.getByRole("button", { name: "Enregistrer les réglages" }).focus();
      await page.keyboard.press("Enter");
    };
    await setVolunteers("0");
    await expect(
      page.getByText("Rien n'a été enregistré. Corrigez les champs signalés."),
    ).toBeVisible();
    await expect(page.getByText("Nombre entier de 1 à 20.")).toBeVisible();
    await setVolunteers("4");
    await expect(page.getByText("Réglages enregistrés.")).toBeVisible();
    await page.reload();
    await expect(volunteers).toHaveValue("4");
    // Remise à la valeur du jeu de données (d'autres tests s'en servent).
    await setVolunteers("3");
    await expect(page.getByText("Réglages enregistrés.")).toBeVisible();

    // Rappel avant la clôture (D5) : délai réglé à 14 jours, la tâche horaire envoie les
    // rappels de la période ouverte (ou les a déjà envoyés si le test a déjà tourné).
    const reminder = page.getByRole("spinbutton", { name: "Rappel avant la clôture (jours)" });
    await expect(reminder).toHaveValue("2");
    const setReminder = async (value: string) => {
      await reminder.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(value);
      await page.getByRole("button", { name: "Enregistrer les réglages" }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText("Réglages enregistrés.")).toBeVisible();
    };
    await setReminder("14");
    const output = execFileSync("pnpm", ["-s", "jobs:hourly"], { encoding: "utf8" });
    const line =
      /Rappel avant clôture \d{4}-\d{2}, AMAP \S+ : (\d+) envoyé\(s\), (\d+) déjà fait\(s\), 0 en échec\./.exec(
        output,
      );
    expect(line, output).not.toBeNull();
    expect(Number(line![1]) + Number(line![2])).toBeGreaterThan(0);
    await page.reload();
    await setReminder("2");
  });

  test("un admin suit sa liste de tâches au clavier : à suivre, fait, rétabli (H3)", async ({
    page,
    request,
  }) => {
    const token = Date.now().toString(36);
    const year = 2040 + (Math.floor(Date.now() / 1000) % 50);
    const reason = `Vacances ${token}`;
    await signInWithSecondFactor(page, request, ADMIN_DEMO);

    // Tableau de bord : avancement des adhésions.
    await page.goto("/hommesdeterre/admin");
    const memberships = page.getByRole("region", { name: "Adhésions" });
    await expect(memberships.getByText(/^\d+ foyers adhérents sur \d+$/)).toBeVisible();

    // Fermer une distribution crée une tâche « À suivre ».
    await page.goto(`/hommesdeterre/admin/planning?mois=${year}-05`);
    // Page chargée : soit des distributions, soit le bouton pour les créer.
    const region = page.getByRole("region", { name: "Distributions" });
    const create = page.getByRole("button", { name: `Créer les distributions de mai ${year}` });
    await expect(region.getByRole("listitem").first().or(create)).toBeVisible();
    if (await create.isVisible()) {
      await create.click();
      await expect(page.getByText(/distributions créées\./)).toBeVisible();
    }
    const closeButton = page.getByRole("button", { name: /^Fermer la distribution du/ }).first();
    await closeButton.click();
    const dialog = page.getByRole("dialog", { name: /^Fermer la distribution du / });
    await dialog.getByRole("textbox", { name: "Motif" }).fill(reason);
    await dialog.getByRole("button", { name: "Fermer la distribution" }).click();
    await expect(page.getByText(/^Distribution du .* fermée\.$/)).toBeVisible();

    await page.goto("/hommesdeterre/admin");
    const tasks = page.getByRole("region", { name: "Votre liste de tâches" });
    const text = `fermée (${reason}) : vérifier que les familles`;
    const row = tasks.getByRole("listitem").filter({ hasText: text });
    await expect(row.getByText("À suivre", { exact: true })).toBeVisible();
    await expect(row.getByRole("link", { name: "Voir le calendrier" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // « Marquer comme fait » au clavier : la tâche passe dans les tâches terminées.
    await row.getByRole("button", { name: /^Marquer comme fait/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Tâche marquée comme faite.")).toBeVisible();
    await expect(row).toHaveCount(0);
    // Contrôle une fois le message de confirmation entièrement apparu (animation).
    await expect(page.locator(".MuiSnackbar-root .MuiAlert-root")).toHaveCSS("opacity", "1");
    const summary = tasks.getByText(/^Tâches terminées \(\d+\)$/);
    await summary.focus();
    await page.keyboard.press("Enter");
    const doneRow = tasks.getByRole("listitem").filter({ hasText: text });
    await expect(doneRow.getByText(/^Fait par .* le /)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // « Rétablir » : de nouveau à faire ; puis faite pour de bon.
    await doneRow.getByRole("button", { name: /^Rétablir/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Tâche rétablie.")).toBeVisible();
    const again = tasks.getByRole("listitem").filter({ hasText: text });
    await expect(again.getByRole("button", { name: /^Marquer comme fait/ })).toBeVisible();
    await again.getByRole("button", { name: /^Marquer comme fait/ }).click();
    await expect(page.getByText("Tâche marquée comme faite.")).toBeVisible();
  });

  test("un admin crée, publie, renomme puis dépublie une page du site au clavier (H2)", async ({
    page,
    request,
  }) => {
    const token = Date.now().toString(36);
    const title = `Recettes d'essai ${token}`;
    const slug = `recettes-d-essai-${token}`;
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin");
    await page
      .getByRole("navigation", { name: "Navigation administrateur" })
      .getByRole("link", { name: "Pages" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Pages" })).toBeVisible();
    const menu = page.getByRole("region", { name: "Menu du site" });
    await expect(menu.getByRole("listitem").first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Nouvelle page : l'adresse suit le titre ; le texte se met en forme au clavier.
    await page.getByRole("link", { name: "Nouvelle page" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Nouvelle page" })).toBeVisible();
    await page.getByRole("textbox", { name: "Titre", exact: true }).focus();
    await page.keyboard.type(title);
    await expect(page.getByRole("textbox", { name: "Adresse" })).toHaveValue(slug);
    const body = page.getByRole("textbox", { name: "Texte" });
    await body.focus();
    await page.keyboard.type("Soupe de potiron : ");
    const toolbar = page.getByRole("toolbar", { name: "Mise en forme" });
    await toolbar.getByRole("button", { name: "Gras" }).click();
    await expect(toolbar.getByRole("button", { name: "Gras" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await body.focus();
    await page.keyboard.press("End");
    await page.keyboard.type("la recette de saison");
    await page.getByRole("checkbox", { name: "Afficher dans le menu du site" }).check();
    await expectNoSeriousA11yViolations(page);
    await page.getByRole("button", { name: "Publier" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Page publiée.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Modifier la page" })).toBeVisible();

    // Sur le site public : dans le menu, texte en gras.
    await page.goto(`/hommesdeterre/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator("strong", { hasText: "la recette de saison" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Menu du site" }).getByRole("link", { name: title }),
    ).toBeVisible();

    // Adresse changée après publication : l'ancienne redirige vers la nouvelle.
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Modifier la page" })).toBeVisible();
    const address = page.getByRole("textbox", { name: "Adresse" });
    await address.fill(`${slug}-v2`);
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page.getByText("Page enregistrée.")).toBeVisible();
    await page.goto(`/hommesdeterre/${slug}`);
    await expect(page).toHaveURL(new URL(`/hommesdeterre/${slug}-v2`, page.url()).toString());

    // Dépubliée : introuvable sur le site, toujours dans la liste.
    await page.goBack();
    await page.getByRole("button", { name: "Dépublier" }).click();
    await expect(page.getByText(/^Page dépubliée/)).toBeVisible();
    await page.goto(`/hommesdeterre/${slug}-v2`);
    await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
    await page.goto("/hommesdeterre/admin/pages");
    await expect(
      page.getByRole("row").filter({ hasText: title }).getByText("Dépubliée"),
    ).toBeVisible();
  });

  test("un admin traite une demande d'adhésion : contactée, puis acceptée (B2)", async ({
    page,
    request,
  }) => {
    const token = Date.now().toString(36);
    const email = `famille.${token}@example.org`;
    // La demande arrive par le site public.
    await page.goto("/hommesdeterre/adherer");
    await page.getByRole("textbox", { name: "Nom et prénom" }).fill(`Camille ${token}`);
    await page.getByRole("textbox", { name: "Adresse email" }).fill(email);
    await page.getByRole("textbox", { name: "Téléphone (facultatif)" }).fill("06 39 98 99 03");
    await page.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page.getByText(/^Merci ! Votre demande est bien arrivée/)).toBeVisible();

    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/foyers");
    await page.getByRole("tab", { name: /^Demandes d'adhésion \(\d+\)$/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/onglet=demandes/);
    const card = page.getByRole("region", { name: `Camille ${token}` });
    await expect(card.getByText("Nouvelle")).toBeVisible();
    await expect(card.getByRole("link", { name: `Écrire Camille ${token}` })).toHaveAttribute(
      "href",
      `mailto:${email}`,
    );
    await expectNoSeriousA11yViolations(page);

    await card.getByRole("button", { name: /^Marquer comme contactée/ }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(`Demande de Camille ${token} marquée comme contactée.`),
    ).toBeVisible();
    await expect(card.getByText("Contactée")).toBeVisible();

    // Accepter : foyer proposé d'après le nom, adhésion d'un an ; puis invitation.
    await card.getByRole("button", { name: `Accepter Camille ${token}` }).focus();
    await page.keyboard.press("Enter");
    const form = page.getByRole("form", { name: `Accepter la demande de Camille ${token}` });
    await expect(form.getByRole("textbox", { name: "Nom du foyer" })).toHaveValue(`Foyer ${token}`);
    await expectNoSeriousA11yViolations(page);
    await form.getByRole("button", { name: "Créer le foyer et inviter" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(`Foyer « Foyer ${token} » créé. L'invitation est partie à ${email}.`),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: `Camille ${token}` })).toHaveCount(0);
    await expect.poll(() => countMessagesTo(request, email)).toBe(1);
  });

  test("un admin crée un producteur au clavier et lui affecte un référent (C1)", async ({
    page,
    request,
  }) => {
    const name = `Ferme d'essai ${Date.now().toString(36)}`;
    await signInWithSecondFactor(page, request, ADMIN_DEMO);

    // Tableau de bord : le producteur du jeu de données sans référent est signalé.
    await page.goto("/hommesdeterre/admin");
    const tasks = page.getByRole("region", { name: "Votre liste de tâches" });
    await expect(
      tasks.getByText(
        "Cidrerie du Clos Fictif n'a pas de référent : personne ne pointe ses chèques.",
      ),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page
      .getByRole("navigation", { name: "Navigation administrateur" })
      .getByRole("link", { name: "Producteurs et référents" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Producteurs et référents" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("row", { name: /Cidrerie du Clos Fictif/ })
        .getByText("Aucun référent : personne ne pointe ses chèques."),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("link", { name: "Ajouter un producteur" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Ajouter un producteur" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // D'abord chercher : ce producteur n'existe nulle part.
    const type = async (field: ReturnType<typeof page.getByRole>, text: string) => {
      await field.focus();
      await page.keyboard.type(text);
    };
    await type(page.getByRole("textbox", { name: "Nom du producteur" }), name);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Aucun producteur de ce nom. Créez-le ci-dessous.")).toBeVisible();

    // Puis le créer, au clavier, avec d'abord une distance refusée.
    await type(page.getByRole("textbox", { name: "Nom", exact: true }), name);
    await type(page.getByRole("textbox", { name: "Catégorie" }), "Légumes");
    await type(page.getByRole("textbox", { name: "Téléphone" }), "06 39 98 99 02");
    await type(page.getByRole("textbox", { name: "Ordre des chèques" }), "EARL d'essai");
    await type(page.getByRole("textbox", { name: "Distance de la ferme (km)" }), "-4");
    await page.getByRole("button", { name: "Créer le producteur" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Rien n'a été enregistré. Corrigez les champs signalés."),
    ).toBeVisible();
    await expect(page.getByText("Saisissez un nombre entier de kilomètres")).toBeVisible();
    await page.getByRole("textbox", { name: "Distance de la ferme (km)" }).fill("14");
    await page.getByRole("button", { name: "Créer le producteur" }).focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText(`Producteur « ${name} » créé.`)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Téléphone" })).toHaveValue("+33639989902");
    await expectNoSeriousA11yViolations(page);

    // Sans référent : tâche « Bloquant » ; avec un référent, elle disparaît.
    await page.goto("/hommesdeterre/admin");
    await expect(tasks.getByText(`${name} n'a pas de référent`, { exact: false })).toBeVisible();
    await page.getByRole("link", { name: `Affecter un référent à ${name}` }).click();
    const referent = page.getByRole("checkbox", { name: "Robin Démo" });
    await referent.focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Enregistrer les référents" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(`Référents de ${name} enregistrés.`)).toBeVisible();

    await page.goto("/hommesdeterre/admin");
    await expect(
      tasks.getByText("Cidrerie du Clos Fictif n'a pas de référent", { exact: false }),
    ).toBeVisible();
    await expect(tasks.getByText(`${name} n'a pas de référent`, { exact: false })).toHaveCount(0);
  });

  test("un admin invite le compte d'un producteur (C1)", async ({ page, request }) => {
    const email = `producteur.${Date.now().toString(36)}@example.org`;
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/producteurs");
    // Compte de démonstration producteur.demo : « Invitation envoyée » tant qu'il ne s'est pas
    // connecté, « Compte actif » ensuite (producer.spec.ts s'y connecte).
    await expect(
      page.getByRole("row", { name: /Les Ruches du Vallon/ }).getByRole("cell", {
        name: /^(Invitation envoyée|Compte actif)$/,
      }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Boulangerie des Trois Moulins" }).click();
    const access = page.getByRole("region", { name: "Accès du producteur" });
    await expect(access).toBeVisible();
    await access.getByRole("textbox", { name: "Adresse email" }).fill(email);
    await access.getByRole("textbox", { name: "Prénom" }).fill("Mathis");
    const before = await inboxSnapshot(request, email);
    await access.getByRole("button", { name: "Inviter" }).click();
    await expect(page.getByText(`Invitation envoyée à ${email}.`)).toBeVisible();
    await expect(access.getByText(email)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    const invitation = await newMessage(request, email, before);
    expect(invitation.Subject).toContain("Boulangerie des Trois Moulins");
    expect(invitation.Text).not.toMatch(/magic-link/);
  });

  test("un référent consulte ses producteurs et modifie l'ordre des chèques au clavier (C1)", async ({
    page,
    request,
  }) => {
    const payee = `EARL des Ruches ${Date.now().toString(36)}`;
    // Sans connexion : renvoi vers la connexion.
    await page.goto("/hommesdeterre/referent/producteurs");
    await expect(page).toHaveURL(/\/connexion$/);

    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await page
      .getByRole("navigation", { name: "Navigation référent" })
      .getByRole("link", { name: "Mes producteurs" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Mes producteurs" })).toBeVisible();
    const tabs = page.getByRole("tablist", { name: "Producteurs suivis" });
    // Les deux producteurs du jeu de données (un passage précédent peut en avoir ajouté).
    await expect(tabs.getByRole("tab", { name: "Boulangerie des Trois Moulins" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "Les Ruches du Vallon" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Au clavier : la touche Fin mène au dernier onglet (ordre alphabétique).
    await tabs.getByRole("tab", { name: "Boulangerie des Trois Moulins" }).focus();
    await page.keyboard.press("End");
    await expect(tabs.getByRole("tab", { name: "Les Ruches du Vallon" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("region", { name: "Coordonnées" })).toContainText(
      "Les Ruches du Vallon",
    );

    await page
      .getByRole("button", { name: "Modifier les coordonnées de Les Ruches du Vallon" })
      .focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Modifier Les Ruches du Vallon" });
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    const field = dialog.getByRole("textbox", { name: "Ordre des chèques" });
    await field.fill("");
    await field.focus();
    await page.keyboard.type(payee);
    await dialog.getByRole("button", { name: "Enregistrer" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Les Ruches du Vallon enregistré.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Contrat et chèques" })).toContainText(payee);
  });

  test("une personne sans rôle référent n'a pas accès à « Mes producteurs »", async ({
    page,
    request,
  }) => {
    // admin2.demo : admin, pas référent ; aucun autre fichier de test ne s'en sert.
    await signInByEmail(page, request, "admin2.demo@example.org");
    await page.goto("/hommesdeterre/referent/producteurs");
    await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
  });

  test("un admin génère les distributions d'un mois, en ferme une puis la rouvre (D1)", async ({
    page,
    request,
  }) => {
    // Un mois lointain, différent à chaque passage : aucune distribution n'y existe encore.
    const year = 2040 + (Math.floor(Date.now() / 1000) % 50);
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin");
    await page
      .getByRole("navigation", { name: "Navigation administrateur" })
      .getByRole("link", { name: "Planning des permanences" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Planning des permanences" }),
    ).toBeVisible();
    // Jeu de données : le jeudi de 18 h à 19 h 30.
    await expect(page.getByText("Chaque jeudi, de 18:00 à 19:30")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.goto(`/hommesdeterre/admin/planning?mois=${year}-03`);
    const region = page.getByRole("region", { name: "Distributions" });
    await expect(region.getByText(`Aucune distribution en mars ${year}.`)).toBeVisible();
    await page.getByRole("button", { name: `Créer les distributions de mars ${year}` }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/distributions créées\./)).toBeVisible();
    // 4 ou 5 jeudis selon le mois.
    await expect(region.getByRole("listitem").nth(3)).toBeVisible();
    // Contrôle une fois le message de confirmation entièrement apparu (animation).
    await expect(page.locator(".MuiSnackbar-root .MuiAlert-root")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);

    // Fermer la première : le motif est obligatoire.
    const closeButton = page.getByRole("button", { name: /^Fermer la distribution du/ }).first();
    const label = (await closeButton.getAttribute("aria-label")) ?? "";
    const date = label.replace("Fermer la distribution du ", "");
    await closeButton.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: `Fermer la distribution du ${date}` });
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    await dialog.getByRole("button", { name: "Fermer la distribution" }).click();
    await expect(dialog.getByText("Saisissez un motif")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Motif" }).fill("Jour férié");
    await dialog.getByRole("button", { name: "Fermer la distribution" }).click();
    await expect(page.getByText(`Distribution du ${date} fermée.`)).toBeVisible();
    await expect(region.getByText("Motif : Jour férié")).toBeVisible();

    await page.getByRole("button", { name: `Rouvrir la distribution du ${date}` }).click();
    await expect(page.getByText(`Distribution du ${date} rouverte.`)).toBeVisible();
    await expect(region.getByText("Motif : Jour férié")).toHaveCount(0);

    // Changer de jour habituel déplace aussi les distributions à venir (retour de recette).
    const changeDay = async (weekday: string, expected: RegExp) => {
      await page.getByRole("button", { name: "Modifier les réglages" }).click();
      const settings = page.getByRole("dialog", { name: "Distribution habituelle" });
      await expect(
        settings.getByRole("checkbox", { name: "Déplacer aussi les distributions à venir" }),
      ).toBeChecked();
      await settings.getByRole("combobox", { name: "Jour" }).click();
      await page.getByRole("option", { name: weekday }).click();
      await settings.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText(/distributions à venir déplacées/)).toBeVisible();
      await expect(region.getByRole("listitem").first()).toContainText(expected);
    };
    await changeDay("vendredi", /^Semaine 1vendredi/);
    // Ménage : retour au jeudi pour les autres tests.
    await changeDay("jeudi", /^Semaine 1jeudi/);
  });

  test("un référent prépare le brouillon du catalogue du mois au clavier (C2)", async ({
    page,
    request,
  }) => {
    const extra = `Brioche ${Date.now().toString(36)}`;
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await page
      .getByRole("navigation", { name: "Navigation référent" })
      .getByRole("link", { name: "Catalogues" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: /^Catalogue de / })).toBeVisible();
    await page.getByRole("tab", { name: "Boulangerie des Trois Moulins" }).click();
    await expect(page).toHaveURL(/producteur=/);
    await expect(page.getByText("Brouillon · non visible des familles")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    const type = async (field: ReturnType<typeof page.getByRole>, text: string) => {
      await field.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(text);
    };
    const price = page.getByRole("textbox", { name: "Prix en euros de Pain au levain, 1 kg" });
    const save = async () => {
      await page.getByRole("button", { name: "Enregistrer le brouillon" }).focus();
      await page.keyboard.press("Enter");
    };

    // Prix invalide : refusé, message près du champ.
    await type(price, "abc");
    await save();
    await expect(page.getByText("Le brouillon n'a pas été enregistré.")).toBeVisible();
    await expect(page.getByText("Prix invalide. Exemple : 4,50.")).toBeVisible();

    // Nouveau prix, une semaine décochée, un produit ajouté, un autre retiré.
    await type(price, "5,40");
    await page
      .getByRole("checkbox", { name: /^Pain au levain, 1 kg disponible le/ })
      .first()
      .focus();
    await page.keyboard.press("Space");
    await type(
      page.getByRole("textbox", { name: "Produit et conditionnement", exact: true }),
      extra,
    );
    await type(page.getByRole("textbox", { name: "Prix (€)", exact: true }), "4,20");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: `Prix en euros de ${extra}` })).toHaveValue(
      "4,20",
    );
    await page
      .getByRole("button", { name: "Retirer Pain aux graines, 500 g de ce catalogue" })
      .focus();
    await page.keyboard.press("Enter");
    const removed = page.getByRole("region", { name: /^Produits? retirés?/ });
    await expect(removed).toContainText("Pain aux graines, 500 g");
    await save();
    await expect(page.getByText(/^Brouillon du catalogue de .* enregistré\.$/)).toBeVisible();

    // Après rechargement, tout est conservé.
    await page.reload();
    await expect(price).toHaveValue("5,40");
    await expect(
      page.getByRole("checkbox", { name: /^Pain au levain, 1 kg disponible le/ }).first(),
    ).not.toBeChecked();
    await expect(page.getByRole("textbox", { name: `Prix en euros de ${extra}` })).toHaveValue(
      "4,20",
    );
    await expect(page.getByRole("region", { name: /^Produits? retirés?/ })).toContainText(
      "Pain aux graines, 500 g",
    );
    await expectNoSeriousA11yViolations(page);

    // Ménage : on remet le catalogue du jeu de données (le produit ajouté reste retiré).
    await type(price, "5,20");
    await page
      .getByRole("checkbox", { name: /^Pain au levain, 1 kg disponible le/ })
      .first()
      .check();
    await page
      .getByRole("button", { name: "Remettre au catalogue : Pain aux graines, 500 g" })
      .click();
    await page.getByRole("button", { name: `Retirer ${extra} de ce catalogue` }).click();
    await save();
    await expect(page.getByText(/^Brouillon du catalogue de .* enregistré\.$/)).toBeVisible();
  });

  test("un admin relance, clôture puis rouvre les commandes du mois au clavier (D2)", async ({
    page,
    request,
  }) => {
    // Jours de Paris, au format des champs de date (« 2026-11-18 »).
    const parisDay = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toLocaleDateString("sv-SE", {
        timeZone: "Europe/Paris",
      });
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    const dialogShown = () =>
      expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");

    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin");
    // Jeu de données : la période du mois prochain est ouverte (rouverte si le test a déjà
    // tourné sur cette base), et 12 foyers ont commandé.
    const banner = page.getByRole("region", { name: /^Commandes de / });
    await expect(banner.getByText(/^(Ouvertes du .* au|Rouvertes jusqu'au) /)).toBeVisible();
    await expect(banner.getByText(/^\d+ foyers sur \d+ ont commandé$/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Relancer : une seule relance par personne et par mois.
    await press(banner.getByRole("button", { name: "Relancer" }));
    const remind = page.getByRole("dialog", { name: "Relancer les foyers sans commande ?" });
    await expect(remind.getByText(/foyers n'ont encore rien commandé/)).toBeVisible();
    await dialogShown();
    await expectNoSeriousA11yViolations(page);
    await press(remind.getByRole("button", { name: "Envoyer" }));
    await expect(page.getByText(/^(\d+ emails envoyés|Aucun email envoyé)/)).toBeVisible();
    await press(banner.getByRole("button", { name: "Relancer" }));
    await press(remind.getByRole("button", { name: "Envoyer" }));
    await expect(
      page.getByText(/^Aucun email envoyé, \d+ personnes déjà relancées\.$/),
    ).toBeVisible();

    // Modifier les dates : l'ouverture est passée, seule la clôture change ; pas dans le passé.
    await press(banner.getByRole("button", { name: "Modifier les dates" }));
    const dates = page.getByRole("dialog", { name: /^Dates des commandes de / });
    await expect(dates.getByLabel("Ouverture le")).toBeDisabled();
    await dialogShown();
    await expectNoSeriousA11yViolations(page);
    await dates.getByLabel("Clôture le (inclus)").fill(parisDay(-1));
    await press(dates.getByRole("button", { name: "Enregistrer" }));
    await expect(dates.getByText("Le jour de clôture est déjà passé.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dates).toHaveCount(0);

    // Clôturer maintenant : les chèques attendus sont calculés.
    await press(banner.getByRole("button", { name: "Clôturer maintenant" }));
    const close = page.getByRole("dialog", {
      name: /^Clôturer les commandes de .* maintenant \?$/,
    });
    await press(close.getByRole("button", { name: "Clôturer" }));
    await expect(
      page.getByText(/^Commandes de .* clôturées : \d+ chèques attendus\.$/),
    ).toBeVisible();
    await expect(banner.getByText(/^Clôturées le /)).toBeVisible();
    await expect(banner.getByRole("button", { name: "Relancer" })).toHaveCount(0);

    // Rouvrir jusqu'à un nouveau jour.
    await press(banner.getByRole("button", { name: "Rouvrir les commandes" }));
    const reopen = page.getByRole("dialog", { name: /^Rouvrir les commandes de / });
    await dialogShown();
    await expectNoSeriousA11yViolations(page);
    await reopen.getByLabel("Clôture le (inclus)").fill(parisDay(5));
    await press(reopen.getByRole("button", { name: "Rouvrir" }));
    await expect(page.getByText(/^Commandes de .* rouvertes jusqu'au /)).toBeVisible();
    await expect(banner.getByText(/^Rouvertes jusqu'au /)).toBeVisible();
  });

  test("un référent publie le catalogue, prépare le suivant et consulte un mois passé (C3)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent/catalogue");
    await page.getByRole("tab", { name: "Les Ruches du Vallon" }).click();
    await expect(page).toHaveURL(/producteur=/);
    const producerParam = new URL(page.url()).searchParams.get("producteur") ?? "";

    // Mois prochain (par défaut) : le brouillon du jeu de données, chaque semaine cochée.
    await press(page.getByRole("button", { name: /^Publier pour / }));
    await expect(page.getByText(/^Catalogue de .* publié\.$/)).toBeVisible();
    await expect(page.getByText("Publié", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Publié : les familles le verront/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Le mois d'après n'a pas encore de catalogue : on le prépare à partir du précédent.
    await press(page.getByRole("link", { name: "Mois suivant" }));
    const prepare = page.getByRole("button", { name: /^Préparer à partir de / });
    // Déjà préparé si le test a tourné sur cette base : on passe directement à la suite.
    if (await prepare.isVisible()) {
      await expectNoSeriousA11yViolations(page);
      await press(prepare);
      await expect(page.getByText(/^Catalogue de .* préparé : 2 produits repris\./)).toBeVisible();
    }
    const firstWeek = page
      .getByRole("checkbox", { name: /^Miel de printemps, pot de 500 g disponible le/ })
      .first();
    await expect(firstWeek).toBeVisible();
    // Semaines non cochées : publication refusée, avec le nom des produits.
    if (!(await firstWeek.isChecked())) {
      await press(page.getByRole("button", { name: /^Publier pour / }));
      await expect(page.getByText(/^Cochez au moins une semaine pour : /)).toBeVisible();
    }

    // Un mois passé : lecture seule, sans bouton d'enregistrement.
    const now = new Date();
    const past = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    await page.goto(
      `/hommesdeterre/referent/catalogue?mois=${past.toISOString().slice(0, 7)}&producteur=${producerParam}`,
    );
    // Dans la zone principale : pendant le chargement, le texte peut exister en double.
    await expect(
      page
        .getByRole("main")
        .getByText("Catalogue en lecture seule : mois passé ou commandes clôturées."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });

  test("un admin renouvelle au clavier l'adhésion d'un foyer qui expire bientôt (B1)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/foyers");

    // Filtre par statut : un onglet par statut, avec le nombre de foyers.
    const filter = page.getByRole("tablist", { name: "Filtrer par adhésion" });
    await press(filter.getByRole("tab", { name: /^Expire bientôt \(\d+\)$/ }));
    await expect(page).toHaveURL(/adhesion=expiring/);
    await expectNoSeriousA11yViolations(page);
    // Jeu de données : quelques foyers dans cet état. Le test les rend tels qu'il les a trouvés.
    const firstHousehold = page.getByRole("main").getByRole("table").getByRole("link").first();
    await press(firstHousehold);

    const section = page.getByRole("region", { name: "Adhésion" });
    await expect(section.getByText("Expire bientôt", { exact: true })).toBeVisible();

    // Renouvellement : dates proposées à la suite de l'adhésion en cours.
    await press(section.getByRole("button", { name: "Ajouter une adhésion" }));
    const dialog = page.getByRole("dialog", { name: "Ajouter une adhésion" });
    await expect(dialog.getByLabel("Début")).not.toHaveValue("");
    await dialog.getByRole("textbox", { name: "Cotisation (€)" }).focus();
    await page.keyboard.type("15");
    // Fenêtre entièrement affichée (fin du fondu) avant de mesurer les contrastes.
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    await press(dialog.getByRole("button", { name: "Enregistrer" }));
    await expect(page.getByText(/^Adhésion du .* enregistrée\.$/)).toBeVisible();
    await expect(section.getByText("Active", { exact: true })).toBeVisible();
    await expect(section.getByRole("cell", { name: "15,00 €" })).toBeVisible();

    // Une adhésion qui chevauche est refusée, avec un message clair.
    await press(section.getByRole("button", { name: "Ajouter une adhésion" }));
    await dialog.getByLabel("Début").fill(new Date().toLocaleDateString("sv-SE"));
    await press(dialog.getByRole("button", { name: "Enregistrer" }));
    await expect(dialog.getByText(/chevauchent une autre adhésion/)).toBeVisible();
    await press(dialog.getByRole("button", { name: "Annuler" }));

    // Ménage : la nouvelle adhésion (la plus récente, en premier) est archivée.
    await press(section.getByRole("button", { name: /^Archiver l'adhésion du / }).first());
    await expect(page.getByText(/^Adhésion du .* archivée\.$/)).toBeVisible();
    await expect(section.getByText("Expire bientôt", { exact: true })).toBeVisible();
  });

  test("un référent consulte, exporte et envoie le bon de commande au producteur (E1)", async ({
    page,
    request,
    browser,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await press(
      page
        .getByRole("navigation", { name: "Navigation référent" })
        .getByRole("link", { name: "Bons de commande" }),
    );
    // Par défaut : le mois en cours de commande, provisoire, sans export.
    await expect(
      page.getByRole("heading", { level: 1, name: /^Bon de commande de / }),
    ).toBeVisible();
    await expect(page.getByText(/^Provisoire : commandes ouvertes jusqu'au /)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Envoyer à / })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // Mois précédent (flèche) : commandes clôturées, Boulangerie des Trois Moulins.
    await press(page.getByRole("link", { name: "Mois précédent" }));
    await expect(page.getByText(/^Commandes clôturées le .* · prix figés$/)).toBeVisible();
    await press(page.getByRole("tab", { name: "Boulangerie des Trois Moulins" }));
    await expect(page.getByRole("region", { name: "À préparer par le producteur" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: /^Détail par foyer \(\d+ foyers?\)$/ }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Tableur : un fichier CSV avec le détail par foyer.
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Télécharger en tableur" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(
      /^bon-de-commande-\d{4}-\d{2}-boulangerie.*\.csv$/,
    );
    const csv = await text((await download.createReadStream())!);
    expect(csv).toContain("Chèque attendu");
    // (Le BOM est retiré au décodage ; il est vérifié par le test unitaire de orderFormCsv.)
    expect(csv).toMatch(/^\uFEFF?Bon de commande Boulangerie des Trois Moulins/);

    // Version à imprimer, dans un nouvel onglet, sans menu.
    const opening = page.context().waitForEvent("page");
    await page.getByRole("link", { name: "Imprimer ou enregistrer en PDF" }).click();
    const printable = await opening;
    await expect(
      printable.getByRole("heading", {
        level: 1,
        name: "Bon de commande · Boulangerie des Trois Moulins",
      }),
    ).toBeVisible();
    await expect(printable.getByRole("navigation")).toHaveCount(0);
    await expectNoSeriousA11yViolations(printable);
    await printable.close();

    // Envoi au producteur : le lien reçu ouvre la version à imprimer sans connexion.
    const producerEmail = "boulangeriedestroismoulins@example.org";
    const before = await inboxSnapshot(request, producerEmail);
    await press(
      page.getByRole("button", { name: "Envoyer à Boulangerie des Trois Moulins par email" }),
    );
    await expect(page.getByText(`Bon de commande envoyé à ${producerEmail}.`)).toBeVisible();
    const email = await newMessage(request, producerEmail, before);
    expect(email.Subject).toMatch(/: bon de commande de /);
    const link = /https?:\/\/\S+\/bon-de-commande\/\S+\?cle=[\w.-]+/.exec(email.Text)?.[0];
    expect(link).toBeDefined();
    const anonymous = await browser.newContext();
    try {
      const outside = await anonymous.newPage();
      await outside.goto(link!);
      await expect(
        outside.getByRole("heading", {
          level: 1,
          name: "Bon de commande · Boulangerie des Trois Moulins",
        }),
      ).toBeVisible();
      // Clé modifiée : refusée.
      await outside.goto(link!.replace(/cle=\d/, "cle=9"));
      await expect(outside.getByText(/^Ce lien n'est plus valable/)).toBeVisible();
    } finally {
      await anonymous.close();
    }
  });
  test("un référent corrige au clavier la commande d'un foyer depuis le bon de commande (D7)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    // Le catalogue du mois prochain des Ruches est un brouillon dans le jeu de données : on le
    // publie s'il ne l'est pas encore (le test C3 a pu le faire).
    await page.goto("/hommesdeterre/referent/catalogue");
    await page.getByRole("tab", { name: "Les Ruches du Vallon" }).click();
    await expect(page).toHaveURL(/producteur=/);
    const publish = page.getByRole("button", { name: /^Publier pour / });
    if (await publish.isVisible()) {
      await press(publish);
      await expect(page.getByText(/^Catalogue de .* publié\.$/)).toBeVisible();
    }

    // Bon de commande du mois en cours de commande : choisir un foyer à corriger.
    await page.goto("/hommesdeterre/referent/bons-de-commande");
    await press(page.getByRole("tab", { name: "Les Ruches du Vallon" }));
    await expect(page).toHaveURL(/producteur=/);
    // Dans la zone principale : pendant le chargement, le texte peut exister en double.
    await expect(
      page.getByRole("main").getByText(/^Provisoire : commandes ouvertes jusqu'au /),
    ).toBeVisible();
    const choice = page.getByRole("combobox", { name: "Foyer" });
    await choice.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Home");
    const household = (await page.getByRole("option").first().textContent())!.trim();
    await page.keyboard.press("Enter");
    await expect(choice).toHaveText(household);
    await expectNoSeriousA11yViolations(page);
    await press(page.getByRole("button", { name: "Ouvrir sa commande" }));

    // Écran de correction : celui de la famille, avec l'avertissement du journal.
    await expect(
      page.getByRole("heading", { level: 1, name: `${household} · Les Ruches du Vallon` }),
    ).toBeVisible();
    await expect(page.getByText(/inscrite au journal\.$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Rien ce mois-ci" })).toHaveCount(0);
    const field = page.getByRole("spinbutton", { name: /^Quantité de / }).first();
    // Une autre valeur que celle déjà là (le test a pu tourner sur cette base).
    const quantity = (await field.inputValue()) === "2" ? "1" : "2";
    await field.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(quantity);
    await expect(page.getByText("Modifications enregistrées")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // De retour sur le bon de commande, le foyer figure dans le détail, avec son lien.
    await press(page.getByRole("link", { name: "Retour" }));
    const correctLink = page.getByRole("link", {
      name: `Corriger la commande du foyer ${household}`,
    });
    await expect(correctLink).toBeVisible();
    await press(correctLink);
    await expect(page.getByRole("spinbutton", { name: /^Quantité de / }).first()).toHaveValue(
      quantity,
    );
  });

  test("un admin corrige la commande d'un foyer depuis sa fiche (D7)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/foyers");
    await press(page.getByRole("main").getByRole("table").getByRole("link").first());

    const section = page.getByRole("region", { name: "Commande du mois" });
    await expect(section.getByText(/^Commande de .*, modifiable jusqu'au /)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await press(section.getByRole("link", { name: /Corriger$/ }).first());

    await expect(page.getByRole("heading", { level: 1, name: / · / })).toBeVisible();
    const field = page.getByRole("spinbutton", { name: /^Quantité de / }).first();
    await field.focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByText("Modifications enregistrées")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Modifications enregistrées")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await press(page.getByRole("link", { name: "Retour" }));
    await expect(page.getByRole("region", { name: "Commande du mois" })).toBeVisible();
  });
  test("un référent remet au producteur les chèques reçus, au clavier (F3)", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent/cheques");
    await expect(page.getByRole("heading", { level: 1, name: /^Chèques de / })).toBeVisible();
    // Un autre producteur que celui du test F1 : les deux tests ne touchent pas les mêmes chèques.
    const tab = page.getByRole("tab", { name: "Les Ruches du Vallon" });
    await tab.focus();
    await page.keyboard.press("Enter");
    await expect(tab).toHaveAttribute("aria-selected", "true");

    // Un chèque reçu, au clavier.
    const box = page.getByRole("checkbox", { name: /^Reçu : /, checked: false }).first();
    const household = (await box.getAttribute("aria-label"))!.replace("Reçu : ", "");
    await box.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: `Reçu : ${household}` })).toBeChecked();

    // Remise au producteur, après confirmation.
    const handOver = page.getByRole("button", {
      name: /^Marquer (le chèque reçu|les \d+ chèques reçus) comme remis à Les Ruches du Vallon$/,
    });
    await handOver.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: /^Remettre \d+ chèques? à Les Ruches du Vallon \?$/,
    });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    await dialog.getByRole("button", { name: "Marquer comme remis" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(/^\d+ chèques? remis à Les Ruches du Vallon\.$/).first(),
    ).toBeVisible();
    // Remis : le chèque ne se modifie plus.
    await expect(page.getByRole("checkbox", { name: `Reçu : ${household}` })).toBeDisabled();
    await expect(handOver).toHaveCount(0);
  });

  test("un référent pointe les chèques reçus au clavier et traite un écart (F1)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await press(
      page
        .getByRole("navigation", { name: "Navigation référent" })
        .getByRole("link", { name: "Pointage des chèques" }),
    );
    // Par défaut : le mois de la dernière clôture (jeu de données : le mois en cours).
    await expect(page.getByRole("heading", { level: 1, name: /^Chèques de / })).toBeVisible();
    await press(page.getByRole("tab", { name: "Boulangerie des Trois Moulins" }));
    await expect(page).toHaveURL(/producteur=/);
    const progress = page
      .getByRole("main")
      .getByText(/^Chèques traités pour \d+ foyers sur \d+ · /);
    await expect(progress).toBeVisible();
    const before = Number(/pour (\d+)/.exec((await progress.textContent())!)![1]);
    await expectNoSeriousA11yViolations(page);

    // Deux foyers pas encore pointés (le test a pu tourner sur cette base).
    const unchecked = page.getByRole("checkbox", {
      name: /^Reçu : /,
      checked: false,
    });
    const first = unchecked.first();
    const firstName = (await first.getAttribute("aria-label"))!.replace("Reçu : ", "");
    const second = unchecked.nth(1);
    const secondName = (await second.getAttribute("aria-label"))!.replace("Reçu : ", "");

    // Espace coche « Reçu » au montant attendu ; Entrée passe au foyer suivant.
    await first.focus();
    await page.keyboard.press("Space");
    await expect(page.getByText(`Chèque reçu : ${firstName} (`, { exact: false })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: `Reçu : ${firstName}` })).toBeChecked();
    await page.keyboard.press("Enter");
    const next = page.getByRole("checkbox", { name: `Reçu : ${secondName}` });
    await expect(next).toBeFocused();
    await expect(progress).toContainText(`Chèques traités pour ${before + 1} foyers sur `);

    // Deuxième foyer : reçu, puis montant corrigé (1 € de moins) et numéro.
    await page.keyboard.press("Space");
    const amount = page.getByRole("textbox", {
      name: `Montant reçu en euros : ${secondName}`,
    });
    await expect(amount).toBeEnabled();
    const expected = (await amount.inputValue()).replace(",", ".");
    const lower = (Number(expected) - 1).toFixed(2).replace(".", ",");
    await amount.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(lower);
    await page.keyboard.press("Tab");
    await page.keyboard.type("1234567");
    await page.keyboard.press("Enter");
    const gapRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: secondName }) });
    await expect(gapRow.getByText("Écart : − 1,00 €")).toBeVisible();

    // Filtre « Écarts » : le foyer y figure jusqu'à ce que l'écart soit traité.
    await press(page.getByRole("button", { name: "Écarts", exact: true }));
    await expect(page.getByRole("rowheader", { name: secondName })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await press(page.getByRole("button", { name: `Écart traité : ${secondName}` }));
    await expect(page.getByText(`Écart traité : ${secondName}.`)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: secondName })).toHaveCount(0);

    // Ménage : les deux chèques redeviennent « non reçus » (Espace décoche).
    await press(page.getByRole("button", { name: "Tous", exact: true }));
    for (const name of [firstName, secondName]) {
      const box = page.getByRole("checkbox", { name: `Reçu : ${name}` });
      await box.focus();
      await page.keyboard.press("Space");
      await expect(box).not.toBeChecked();
    }
    await expect(progress).toContainText(`Chèques traités pour ${before} foyers`);
  });

  test("un admin reporte un écart de la feuille d'émargement puis le rejette au clavier (F5)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin");
    await press(
      page
        .getByRole("navigation", { name: "Navigation administrateur" })
        .getByRole("link", { name: "Signalements" }),
    );
    await expect(page.getByRole("heading", { level: 1, name: "Signalements" })).toBeVisible();

    // Feuille d'émargement : choisir une distribution passée (au clavier), puis le foyer.
    const distribution = page.getByRole("combobox", { name: "Distribution" });
    await distribution.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option").first()).toBeVisible();
    // Une distribution avec des commandes : la deuxième ou plus ancienne (la plus récente peut
    // être aujourd'hui sans commande dans le jeu de données).
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/distribution=/);
      if (await page.getByRole("combobox", { name: "Foyer" }).isVisible()) break;
      await distribution.focus();
      await page.keyboard.press("Enter");
    }
    const household = (await page.getByRole("combobox", { name: "Foyer" }).textContent())!.trim();
    await page.getByRole("radio", { name: "Produit manquant" }).focus();
    await page.keyboard.press("Space");
    await press(page.getByRole("button", { name: "Reporter l'écart" }));
    await expect(page.getByText(`Écart reporté pour ${household}.`)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // À traiter : le rejeter, avec un motif (montré à la famille).
    const toTreat = page.getByRole("region", { name: /^À traiter \(\d+\)$/ });
    const reject = toTreat
      .getByRole("button", { name: `Rejeter le signalement de ${household} (` })
      .first();
    await press(reject);
    const dialog = page.getByRole("dialog", { name: `Rejeter le signalement de ${household} ?` });
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    await press(dialog.getByRole("button", { name: "Rejeter" }));
    await expect(dialog.getByText("Indiquez un motif : la famille le verra.")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Motif du rejet" }).focus();
    await page.keyboard.type("Écart rectifié sur place par les bénévoles");
    await press(dialog.getByRole("button", { name: "Rejeter" }));
    await expect(page.getByText(`Signalement de ${household} rejeté.`)).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Traités" })
        .getByText("Écart rectifié sur place par les bénévoles")
        .first(),
    ).toBeVisible();
  });

  test("un admin ouvre le pointage des chèques depuis son espace (F1)", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin");
    await page
      .getByRole("navigation", { name: "Navigation administrateur" })
      .getByRole("link", { name: "Chèques" })
      .click();
    await expect(page).toHaveURL(/\/admin\/cheques/);
    await expect(page.getByRole("heading", { level: 1, name: /^Chèques de / })).toBeVisible();
    // Tous les producteurs actifs, pas seulement ceux d'un référent.
    expect(await page.getByRole("tab").count()).toBeGreaterThan(2);
    await expect(
      page.getByRole("main").getByText(/^Chèques traités pour \d+ foyers sur \d+ · /),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("un admin crée au clavier un avoir à partir d'un signalement, visible dans l'historique (F2)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/signalements");

    // Un écart de la feuille d'émargement : première distribution passée qui a des commandes.
    const distribution = page.getByRole("combobox", { name: "Distribution" });
    for (let attempt = 0; attempt < 6; attempt++) {
      await distribution.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("option").first()).toBeVisible();
      for (let i = 0; i <= attempt; i++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/distribution=/);
      if (await page.getByRole("combobox", { name: "Foyer" }).isVisible()) break;
    }
    const household = (await page.getByRole("combobox", { name: "Foyer" }).textContent())!.trim();
    await page.getByRole("radio", { name: "Produit abîmé" }).focus();
    await page.keyboard.press("Space");
    await press(page.getByRole("button", { name: "Reporter l'écart" }));
    await expect(page.getByText(`Écart reporté pour ${household}.`)).toBeVisible();

    // « Créer un avoir » : montant proposé, ajusté à 1 €.
    await press(page.getByRole("button", { name: `Créer un avoir pour ${household} (` }).first());
    const dialog = page.getByRole("dialog", { name: `Créer un avoir pour ${household}` });
    await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
    const amount = dialog.getByRole("textbox", { name: "Montant de l'avoir" });
    await expect(amount).not.toHaveValue("");
    await expectNoSeriousA11yViolations(page);
    await amount.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("0");
    await press(dialog.getByRole("button", { name: "Créer l'avoir" }));
    await expect(dialog.getByText(/^Montant non valable/)).toBeVisible();
    await amount.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("1,00");
    await press(dialog.getByRole("button", { name: "Créer l'avoir" }));
    await expect(
      page.getByText(`Avoir de 1,00 € créé pour ${household} : déduit de son prochain chèque.`),
    ).toBeVisible();

    // Historique : filtré sur ce foyer, l'avoir attend le prochain chèque.
    const history = page.getByRole("region", { name: "Historique des avoirs" });
    const filter = history.getByRole("combobox", { name: "Foyer" });
    await filter.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: household, exact: true }).click();
    await expect(
      history
        .getByRole("row")
        .filter({ hasText: "1,00 €" })
        .getByText("En attente du prochain chèque")
        .first(),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("un admin ouvre au clavier la feuille d'émargement du mois, prête à imprimer (E3)", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/planning");
    const link = page.getByRole("link", { name: /^Imprimer la feuille d'émargement de / });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/hommesdeterre\/emargement\/\d{4}-\d{2}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /^Feuille d'émargement · / }),
    ).toBeVisible();
    // Jeu de données : commandes du mois en cours chez plusieurs producteurs et foyers.
    const deliveries = page.getByRole("region", { name: "1. Livraisons par producteur" });
    const pickups = page.getByRole("region", { name: "2. Retraits par foyer" });
    await expect(deliveries.getByRole("table", { name: /^Livraisons de / }).first()).toBeVisible();
    await expect(pickups.getByRole("table", { name: /^Retraits du foyer / }).first()).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Bénévoles de permanence" }).getByRole("table").first(),
    ).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // Sur papier : plus de bouton.
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Imprimer" })).toBeHidden();
    await page.emulateMedia({ media: "screen" });
  });

  test("un référent n'a pas accès à la feuille d'émargement (E3)", async ({ page, request }) => {
    await signInWithSecondFactor(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/emargement/2026-12");
    await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});
