import { text } from "node:stream/consumers";

import { expect, test } from "@playwright/test";

import { totpFromBase32 } from "../helpers/totp";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { inboxSnapshot, newMessage } from "./helpers/mailpit";
import {
  ADMIN_DEMO,
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
  await signInByEmail(page, request, "referent.demo@example.org");
  await page.getByRole("link", { name: "Plus tard" }).click();
  await expect(page).toHaveURL(/\/hommesdeterre\/referent$/);
  const menu = page.getByRole("navigation", { name: "Menu du référent" });
  await expect(menu.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Référent seulement : pas de sélecteur vers l'administration.
  await expect(page.getByRole("navigation", { name: "Changer d'espace" })).toHaveCount(0);
  await page.getByRole("link", { name: "Mon compte" }).click();
  await expect(page.getByRole("link", { name: /— Référent$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /— Mon foyer$/ })).toBeVisible();
});

test("un référent n'a pas accès à l'administration", async ({ page, request }) => {
  await signInByEmail(page, request, "referent.demo@example.org");
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

  test("le menu latéral et le sélecteur d'espace mènent du référent à l'administration", async ({
    page,
    request,
  }) => {
    // admin.demo est aussi référent : il arrive dans l'administration, et passe d'un espace
    // à l'autre avec le sélecteur.
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
    await page
      .getByRole("navigation", { name: "Changer d'espace" })
      .getByRole("link", { name: "Référent" })
      .click();
    await expect(page).toHaveURL(/\/hommesdeterre\/referent$/);
    const menu = page.getByRole("navigation", { name: "Menu du référent" });
    await expect(menu.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page
      .getByRole("navigation", { name: "Changer d'espace" })
      .getByRole("link", { name: "Administration" })
      .click();
    await expect(page).toHaveURL(/\/hommesdeterre\/admin$/);
    await expect(page.getByRole("navigation", { name: "Menu de l'administration" })).toBeVisible();
  });

  test("le gestionnaire accède à la plateforme après la deuxième vérification", async ({
    page,
    request,
  }) => {
    await signInWithSecondFactor(page, request, PLATFORM_ADMIN_DEMO);
    await page.goto("/plateforme");
    await expect(
      page.getByRole("heading", { level: 1, name: "Gestion de la plateforme" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
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
    await page.goto("/compte");
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
      .getByRole("navigation", { name: "Menu de l'administration" })
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
    await dialog.getByRole("checkbox", { name: "Référent" }).check();
    await expect(page.getByText("Rôles de Claude Essai mis à jour.")).toBeVisible();
    await dialog.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("cell", { name: "Référent" })).toBeVisible();

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
      .getByRole("navigation", { name: "Menu de l'administration" })
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

    await signInByEmail(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await page
      .getByRole("navigation", { name: "Menu du référent" })
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
      .getByRole("navigation", { name: "Menu de l'administration" })
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
    await expect(page.locator(".MuiSnackbarContent-root")).toHaveCSS("opacity", "1");
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
    await signInByEmail(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await page
      .getByRole("navigation", { name: "Menu du référent" })
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
    await signInByEmail(page, request, "referent.demo@example.org");
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
    await signInByEmail(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await press(
      page
        .getByRole("navigation", { name: "Menu du référent" })
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
    await signInByEmail(page, request, "referent.demo@example.org");
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
  test("un référent pointe les chèques reçus au clavier et traite un écart (F1)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    await signInByEmail(page, request, "referent.demo@example.org");
    await page.goto("/hommesdeterre/referent");
    await press(
      page
        .getByRole("navigation", { name: "Menu du référent" })
        .getByRole("link", { name: "Pointage des chèques" }),
    );
    // Par défaut : le mois de la dernière clôture (jeu de données : le mois en cours).
    await expect(page.getByRole("heading", { level: 1, name: /^Chèques de / })).toBeVisible();
    await press(page.getByRole("tab", { name: "Boulangerie des Trois Moulins" }));
    await expect(page).toHaveURL(/producteur=/);
    const progress = page.getByRole("main").getByText(/^Chèques traités pour \d+ foyers sur \d+$/);
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
    await expect(progress).toHaveText(
      `Chèques traités pour ${before + 1} foyers sur ${/sur (\d+)/.exec((await progress.textContent())!)![1]}`,
    );

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
    await expect(gapRow.getByText("− 1,00 €")).toBeVisible();

    // Filtre « Écarts » : le foyer y figure jusqu'à ce que l'écart soit traité.
    await press(page.getByRole("button", { name: /^Écarts \(\d+\)$/ }));
    await expect(page.getByRole("rowheader", { name: secondName })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await press(page.getByRole("button", { name: `Écart traité : ${secondName}` }));
    await expect(page.getByText(`Écart traité : ${secondName}.`)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: secondName })).toHaveCount(0);

    // Ménage : les deux chèques redeviennent « non reçus » (Espace décoche).
    await press(page.getByRole("button", { name: /^Tous \(\d+\)$/ }));
    for (const name of [firstName, secondName]) {
      const box = page.getByRole("checkbox", { name: `Reçu : ${name}` });
      await box.focus();
      await page.keyboard.press("Space");
      await expect(box).not.toBeChecked();
    }
    await expect(progress).toContainText(`Chèques traités pour ${before} foyers`);
  });
});
