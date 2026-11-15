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
    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/referent");
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
    await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();

    // La session est vérifiée : l'administration s'ouvre directement.
    await page.goto("/hommesdeterre/admin");
    await expect(
      page.getByRole("heading", { level: 1, name: "Administration de l'AMAP" }),
    ).toBeVisible();

    // Ménage : le compte doit rester sans moyen de vérification pour la prochaine fois.
    await page.goto("/compte");
    await page.getByRole("button", { name: "Désactiver l'application" }).click();
    await expect(
      page.getByRole("button", { name: "Activer l'application d'authentification" }),
    ).toBeVisible();
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
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exporter les données (JSON)" }).click();
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
    await expect(
      page.getByRole("row", { name: /Les Ruches du Vallon/ }).getByRole("cell", {
        name: "Invitation envoyée",
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
    // Jeu de données : le mardi de 18 h à 19 h 30.
    await expect(page.getByText("Chaque mardi, de 18:00 à 19:30")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.goto(`/hommesdeterre/admin/planning?mois=${year}-03`);
    const region = page.getByRole("region", { name: "Distributions" });
    await expect(region.getByText(`Aucune distribution en mars ${year}.`)).toBeVisible();
    await page.getByRole("button", { name: `Créer les distributions de mars ${year}` }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/distributions créées\./)).toBeVisible();
    // 4 ou 5 mardis selon le mois.
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
  });
});
