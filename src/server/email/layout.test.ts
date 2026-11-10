import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/ui/theme/contrast";

import { PLATFORM_BRAND, renderEmail, type EmailBody } from "./layout";

const body: EmailBody = {
  subject: "Objet <test>",
  greeting: "Bonjour,",
  paragraphs: ["Premier paragraphe & suite."],
  action: { label: "Ouvrir", url: "https://exemple.org/a?b=1&c=2" },
  notes: ["Une note."],
  footer: "Pied de page.",
};

/** Couleurs du bouton : fond de la cellule arrondie, et texte du lien qu'elle contient. */
const buttonColors = (html: string) => ({
  background: /border-radius:20px;background:(#[0-9a-f]{6})/i.exec(html)?.[1] ?? "",
  text: /font-weight:bold;color:(#[0-9a-f]{6});text-decoration:none/i.exec(html)?.[1] ?? "",
});

describe("renderEmail", () => {
  const email = renderEmail(PLATFORM_BRAND, body);

  it("a une version texte complète, lien en clair compris", () => {
    expect(email.text).toContain("Bonjour,");
    expect(email.text).toContain("Premier paragraphe & suite.");
    expect(email.text).toContain("https://exemple.org/a?b=1&c=2");
    expect(email.text).toContain("Une note.");
    expect(email.text).toContain("Pomme · Pied de page.");
  });

  it("échappe le contenu dans la version HTML", () => {
    expect(email.html).toContain("Objet &lt;test&gt;");
    expect(email.html).toContain("Premier paragraphe &amp; suite.");
    expect(email.html).toContain('href="https://exemple.org/a?b=1&amp;c=2"');
  });

  it("est en français et ne contient aucune image", () => {
    expect(email.html).toContain('<html lang="fr">');
    expect(email.html).not.toMatch(/<img|background-image|url\(/i);
  });

  it("prend les couleurs de l'AMAP, avec un bouton lisible (contraste AA)", () => {
    const amap = renderEmail(
      { name: "AMAP des Hommes de terre", theme: { primary: "#f2c94c" } },
      body,
    );
    expect(amap.html).not.toBe(email.html);
    const { background, text } = buttonColors(amap.html);
    expect(background).not.toBe("");
    expect(contrastRatio(background, text)).toBeGreaterThanOrEqual(4.5);
  });
});
