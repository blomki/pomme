import { describe, expect, it } from "vitest";

import {
  checkPageFields,
  cleanRichText,
  isSafeHref,
  moveInMenu,
  pagePath,
  richTextPlain,
  shareTexts,
  sortChildren,
  suggestPageSlug,
  validatePageSlug,
  type RichDoc,
} from "./pages";

const STORAGE = "https://stockage.example.org/pomme/";

describe("adresses des pages", () => {
  it("propose une adresse d'après le titre", () => {
    expect(suggestPageSlug("Visite à la ferme de l'Écluse !")).toBe(
      "visite-a-la-ferme-de-l-ecluse",
    );
    expect(suggestPageSlug("x".repeat(100))).toHaveLength(80);
  });

  it("refuse une adresse vide, mal formée, trop longue, ou prise par l'application", () => {
    expect(validatePageSlug("", true)).toBe("required");
    expect(validatePageSlug("Blog", true)).toBe("invalid_characters");
    expect(validatePageSlug("blog--hiver", true)).toBe("invalid_characters");
    expect(validatePageSlug("a".repeat(81), true)).toBe("too_long");
    expect(validatePageSlug("admin", true)).toBe("reserved");
    // Une sous-page peut s'appeler « admin » : /blog/admin ne masque rien.
    expect(validatePageSlug("admin", false)).toBeNull();
    expect(validatePageSlug("nous-rejoindre", true)).toBeNull();
  });

  it("donne le chemin public : accueil, page principale, sous-page", () => {
    expect(pagePath({ role: "home", slug: "accueil", parentSlug: null })).toBe("");
    expect(pagePath({ role: null, slug: "blog", parentSlug: null })).toBe("/blog");
    expect(pagePath({ role: null, slug: "fete", parentSlug: "blog" })).toBe("/blog/fete");
  });
});

describe("checkPageFields", () => {
  const valid = {
    title: "Fête de l'été",
    summary: "",
    slug: "fete-de-l-ete",
    isTopLevel: false,
    ogTitle: "",
    ogDescription: "",
    imageAlt: "",
  };

  it("accepte une page complète", () => {
    expect(checkPageFields(valid)).toEqual([]);
  });

  it("signale le titre manquant, les champs trop longs et l'adresse", () => {
    expect(
      checkPageFields({
        ...valid,
        title: " ",
        summary: "x".repeat(161),
        ogTitle: "y".repeat(61),
        slug: "",
      }),
    ).toEqual([
      { field: "title", problem: "required" },
      { field: "summary", problem: "too_long" },
      { field: "ogTitle", problem: "too_long" },
      { field: "slug", problem: "required" },
    ]);
  });
});

describe("cleanRichText", () => {
  const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, marks });

  it("garde les éléments permis", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("Au programme")] },
        {
          type: "paragraph",
          content: [
            text("Récolte ", [{ type: "bold" }]),
            { type: "hardBreak" },
            text("le site", [
              { type: "link", attrs: { href: "https://exemple.org", target: "_blank" } },
            ]),
          ],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [text("Courges")] }] },
          ],
        },
        { type: "image", attrs: { src: `${STORAGE}pages/a.webp`, alt: "Panier", title: "x" } },
      ],
    };
    expect(cleanRichText(doc, STORAGE)).toEqual({
      type: "doc",
      content: [
        { type: "heading", level: 2, content: [{ type: "text", text: "Au programme" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Récolte ", marks: [{ type: "bold" }] },
            { type: "hardBreak" },
            {
              type: "text",
              text: "le site",
              marks: [{ type: "link", href: "https://exemple.org" }],
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Courges" }] }],
            },
          ],
        },
        { type: "image", src: `${STORAGE}pages/a.webp`, alt: "Panier" },
      ],
    });
  });

  it("retire les liens dangereux, les images d'ailleurs et les éléments inconnus", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [text("clic", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])],
        },
        { type: "image", attrs: { src: "https://pirate.example.com/x.png" } },
        { type: "codeBlock", content: [text("<script>")] },
        { type: "heading", attrs: { level: 1 }, content: [text("Titre")] },
        { type: "blockquote", content: [] },
      ],
    };
    expect(cleanRichText(doc, STORAGE)).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "clic" }] },
        // Un titre de niveau 1 devient un intertitre de niveau 2.
        { type: "heading", level: 2, content: [{ type: "text", text: "Titre" }] },
      ],
    });
    // Sans stockage configuré, aucune image n'est permise.
    expect(
      cleanRichText(
        { type: "doc", content: [{ type: "image", attrs: { src: `${STORAGE}a.webp` } }] },
        null,
      ),
    ).toEqual({ type: "doc", content: [] });
  });

  it("refuse ce qui n'est pas un document, ou un document démesuré", () => {
    expect(cleanRichText(null, STORAGE)).toBeNull();
    expect(cleanRichText({ type: "paragraph" }, STORAGE)).toBeNull();
    expect(
      cleanRichText(
        { type: "doc", content: [{ type: "paragraph", content: [text("x".repeat(50_001))] }] },
        STORAGE,
      ),
    ).toBeNull();
    // Listes imbriquées sans fin.
    let deep: unknown = { type: "paragraph", content: [text("fond")] };
    for (let i = 0; i < 10; i++) {
      deep = { type: "bulletList", content: [{ type: "listItem", content: [deep] }] };
    }
    expect(cleanRichText({ type: "doc", content: [deep] }, STORAGE)).toBeNull();
  });
});

describe("isSafeHref", () => {
  it("n'accepte que http(s), mailto et les adresses du site", () => {
    expect(["https://a.org", "http://a.org/x", "mailto:a@b.org", "/blog"].map(isSafeHref)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(
      ["javascript:alert(1)", "data:text/html,x", "//pirate.org", "ftp://a"].map(isSafeHref),
    ).toEqual([false, false, false, false]);
  });
});

describe("textes de partage", () => {
  const body: RichDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Samedi, récolte des courges." }] },
    ],
  };

  it("prend les champs saisis, sinon le titre et le résumé ou le début du texte", () => {
    const page = { title: "Récolte", summary: "", ogTitle: "", ogDescription: "", body };
    expect(shareTexts(page)).toEqual({
      title: "Récolte",
      description: "Samedi, récolte des courges.",
    });
    expect(shareTexts({ ...page, summary: "Le résumé" }).description).toBe("Le résumé");
    expect(shareTexts({ ...page, ogTitle: "Partage", ogDescription: "Desc" })).toEqual({
      title: "Partage",
      description: "Desc",
    });
    const long = shareTexts({ ...page, summary: "mot ".repeat(60) }).description;
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith("…")).toBe(true);
    expect(richTextPlain({ type: "doc", content: [] })).toBe("");
  });
});

describe("ordre des pages", () => {
  const pages = [
    { title: "B", publishedOn: "2026-10-01", position: 2 },
    { title: "A", publishedOn: "2026-11-01", position: 3 },
    { title: "C", publishedOn: null, position: 1 },
  ];

  it("trie les sous-pages par date (récentes d'abord) ou dans l'ordre manuel", () => {
    expect(sortChildren(pages, "date_desc").map((p) => p.title)).toEqual(["A", "B", "C"]);
    expect(sortChildren(pages, "manual").map((p) => p.title)).toEqual(["C", "B", "A"]);
  });

  it("avance ou recule une page dans le menu, sans sortir de la liste", () => {
    expect(moveInMenu(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInMenu(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveInMenu(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveInMenu(["a", "b"], "z", 1)).toEqual(["a", "b"]);
  });
});
