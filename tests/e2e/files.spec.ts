import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { expectNoSeriousA11yViolations } from "./helpers/accessibility";
import { ADMIN_DEMO, signInWithSecondFactor } from "./helpers/auth";

// Envoi et stockage des photos (fiche S11) : l'admin envoie la photo d'un producteur au clavier,
// le référent la voit et la retire. Le stockage est le service « files » (SeaweedFS).

const PRODUCER = "Les Ruches du Vallon";
const ALT = "Ruches alignées au bord d'un verger";

/** Ouvre le sélecteur de fichier au clavier (Espace sur le champ), puis y dépose le fichier. */
async function chooseFile(
  page: Page,
  label: RegExp,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  const field = page.getByLabel(label);
  await field.focus();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Space");
  await (await chooser).setFiles(file);
}

test.describe("photos (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écrans d'ordinateur");

  test("un admin envoie au clavier la photo d'un producteur, le référent la voit puis la retire (S11)", async ({
    page,
    request,
    browser,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    // Photo de téléphone : grande, avec une position GPS.
    const photo = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: "#c8a13a" },
    })
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "49/1 8/1 0/1" } })
      .jpeg()
      .toBuffer();

    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/producteurs");
    await press(page.getByRole("link", { name: PRODUCER }));
    const section = page.getByRole("region", { name: "Photo" });
    await expect(section).toBeVisible();
    // Le test a pu tourner sur cette base : on repart sans photo.
    const leftover = section.getByRole("button", { name: "Retirer la photo" });
    if (await leftover.isVisible()) {
      await press(leftover);
      await expect(page.getByText(`Photo de ${PRODUCER} retirée.`)).toBeVisible();
    }
    await expectNoSeriousA11yViolations(page);

    // Un fichier qui n'est pas une photo : message clair, rien n'est envoyé.
    await chooseFile(page, /^Choisir une photo/, {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("pas une photo"),
    });
    await expect(section.getByRole("alert")).toHaveText(/n'est pas une photo lisible/);

    // La vraie photo : aperçu, texte alternatif, enregistrement.
    await chooseFile(page, /^Choisir une photo/, {
      name: "ruches.jpg",
      mimeType: "image/jpeg",
      buffer: photo,
    });
    await expect(section.getByRole("alert")).toHaveCount(0);
    await section.getByLabel("Texte alternatif").focus();
    await page.keyboard.type(ALT);
    await press(section.getByRole("button", { name: "Enregistrer la photo" }));
    await expect(page.getByText(`Photo de ${PRODUCER} enregistrée.`)).toBeVisible();

    // L'image vient du stockage, s'affiche (CSP), réduite et réencodée en WebP.
    const image = section.getByRole("img", { name: ALT });
    await expect(image).toHaveAttribute(
      "src",
      /^http:\/\/localhost:8333\/pomme-fichiers\/producteurs\/.+\.webp$/,
    );
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBe(1200);
    const src = (await image.getAttribute("src"))!;
    const stored = await request.get(src);
    expect(stored.headers()["content-type"]).toBe("image/webp");
    expect((await sharp(await stored.body()).metadata()).exif).toBeUndefined();
    await expectNoSeriousA11yViolations(page);

    // Le référent du producteur la voit dans « Mes producteurs », et la retire.
    const referentContext = await browser.newContext();
    try {
      const referent = await referentContext.newPage();
      await signInWithSecondFactor(referent, request, "referent.demo@example.org");
      await referent.goto("/hommesdeterre/referent/producteurs");
      await referent.getByRole("tab", { name: PRODUCER }).click();
      const own = referent.getByRole("region", { name: "Photo" });
      await expect(own.getByRole("img", { name: ALT })).toBeVisible();
      await expectNoSeriousA11yViolations(referent);
      await own.getByRole("button", { name: "Retirer la photo" }).focus();
      await referent.keyboard.press("Enter");
      await expect(referent.getByText(`Photo de ${PRODUCER} retirée.`)).toBeVisible();
      await expect(own.getByText("Pas encore de photo")).toBeVisible();
    } finally {
      await referentContext.close();
    }
    // Le fichier a quitté le stockage.
    await expect.poll(async () => (await request.get(src)).status()).not.toBe(200);
  });
});

test.describe("images des bandeaux (ordinateur)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "écrans d'ordinateur");

  test("un admin donne une image au bandeau des foyers, visible sur ses écrans, puis la retire (S14)", async ({
    page,
    request,
  }) => {
    const press = async (locator: ReturnType<typeof page.getByRole>) => {
      await locator.focus();
      await page.keyboard.press("Enter");
    };
    const illustration = await sharp({
      create: { width: 900, height: 900, channels: 4, background: "#4f7a28" },
    })
      .png()
      .toBuffer();
    // Image décorative du bandeau : sans texte alternatif, on la reconnaît à son adresse. Seule
    // l'image visible compte : pendant l'envoi progressif de la page (streaming), Next.js garde un
    // instant une copie cachée du contenu.
    const bannerImage = page.locator('main img[src*="/bandeaux/"]').filter({ visible: true });

    await signInWithSecondFactor(page, request, ADMIN_DEMO);
    await page.goto("/hommesdeterre/admin/reglages");
    const images = page.getByRole("region", { name: "Images des bandeaux" });
    const section = images.getByRole("region", { name: "Foyers et adhésions" });
    await expect(section).toBeVisible();
    // Le test a pu tourner sur cette base : on repart sans image.
    const leftover = section.getByRole("button", { name: "Retirer la photo" });
    if (await leftover.isVisible()) {
      await press(leftover);
      await expect(page.getByText(/« Foyers et adhésions » retirée/)).toBeVisible();
    }
    await expectNoSeriousA11yViolations(page);

    const field = section.getByLabel(/^Choisir une photo/);
    await field.focus();
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Space");
    await (
      await chooser
    ).setFiles({
      name: "foyers.png",
      mimeType: "image/png",
      buffer: illustration,
    });
    await press(section.getByRole("button", { name: "Enregistrer la photo" }));
    await expect(
      page.getByText("Image du bandeau « Foyers et adhésions » enregistrée."),
    ).toBeVisible();

    // Visible en tête des écrans des foyers, pas sur ceux des chèques.
    await page.goto("/hommesdeterre/admin/foyers");
    await expect(bannerImage).toBeVisible();
    await page.goto("/hommesdeterre/admin/cheques");
    await expect(bannerImage).toHaveCount(0);

    // Retirée : le bandeau des foyers reprend le logo (ou rien).
    await page.goto("/hommesdeterre/admin/reglages");
    await press(section.getByRole("button", { name: "Retirer la photo" }));
    await expect(page.getByText(/« Foyers et adhésions » retirée/)).toBeVisible();
    await page.goto("/hommesdeterre/admin/foyers");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(bannerImage).toHaveCount(0);
  });
});
