/**
 * Pages du site public d'une AMAP (story H2, ADR 0033). Un seul type de contenu, la page, avec un
 * seul niveau de sous-pages ; le blog est une page principale dont les sous-pages sont les
 * billets. Brouillon, publiée, dépubliée : jamais supprimée. Accueil et mentions légales
 * obligatoires.
 */

import { slugify } from "./amap-slug";

export const PAGE_STATUSES = ["draft", "published", "unpublished"] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

/** Pages obligatoires : une de chaque par AMAP, créées avec elle. */
export const PAGE_ROLES = ["home", "legal"] as const;
export type PageRole = (typeof PAGE_ROLES)[number];

/** Ordre des sous-pages d'une page principale. */
export const CHILDREN_ORDERS = ["date_desc", "manual"] as const;
export type ChildrenOrder = (typeof CHILDREN_ORDERS)[number];

export const PAGE_LIMITS = {
  title: 120,
  summary: 160,
  slug: 80,
  ogTitle: 60,
  ogDescription: 160,
  imageAlt: 150,
} as const;

/**
 * Adresses déjà prises par l'application sous [domaine]/<amap>/ : une page principale ne peut
 * pas s'appeler ainsi (elle masquerait l'espace correspondant).
 */
export const RESERVED_PAGE_SLUGS: readonly string[] = [
  "admin",
  "api",
  "bon-de-commande",
  "connexion",
  "emargement",
  "famille",
  "referent",
];

export type PageSlugError = "required" | "too_long" | "invalid_characters" | "reserved";

/** Adresse proposée d'après le titre : « Visite à la ferme » → « visite-a-la-ferme ». */
export function suggestPageSlug(title: string): string {
  return slugify(title, PAGE_LIMITS.slug);
}

/**
 * Vérifie l'adresse d'une page : minuscules sans accent, chiffres et tirets simples, 80
 * caractères au plus ; une page principale ne prend pas une adresse de l'application.
 */
export function validatePageSlug(slug: string, isTopLevel: boolean): PageSlugError | null {
  if (slug === "") return "required";
  if (slug.length > PAGE_LIMITS.slug) return "too_long";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "invalid_characters";
  if (isTopLevel && RESERVED_PAGE_SLUGS.includes(slug)) return "reserved";
  return null;
}

/** Chemin public d'une page, sous l'adresse de l'AMAP (« /blog/visite-a-la-ferme »). */
export function pagePath(page: {
  role: PageRole | null;
  slug: string;
  parentSlug: string | null;
}): string {
  if (page.role === "home") return "";
  return page.parentSlug ? `/${page.parentSlug}/${page.slug}` : `/${page.slug}`;
}

export type PageFieldsProblem =
  | { field: "title"; problem: "required" | "too_long" }
  | { field: "summary" | "ogTitle" | "ogDescription" | "imageAlt"; problem: "too_long" }
  | { field: "slug"; problem: PageSlugError };

/** Contrôle des champs d'une page (le texte riche a sa propre règle : cleanRichText). */
export function checkPageFields(input: {
  title: string;
  summary: string;
  slug: string;
  isTopLevel: boolean;
  ogTitle: string;
  ogDescription: string;
  imageAlt: string;
}): PageFieldsProblem[] {
  const problems: PageFieldsProblem[] = [];
  const title = input.title.trim();
  if (title === "") problems.push({ field: "title", problem: "required" });
  else if (title.length > PAGE_LIMITS.title) problems.push({ field: "title", problem: "too_long" });
  for (const field of ["summary", "ogTitle", "ogDescription", "imageAlt"] as const) {
    if (input[field].trim().length > PAGE_LIMITS[field]) {
      problems.push({ field, problem: "too_long" });
    }
  }
  const slugError = validatePageSlug(input.slug, input.isTopLevel);
  if (slugError) problems.push({ field: "slug", problem: slugError });
  return problems;
}

// --- Texte riche -------------------------------------------------------------------------------
// L'éditeur (Tiptap) envoie un document JSON. Le serveur n'en garde que ce qui est permis, et
// l'affiche lui-même (jamais de HTML brut) : rien d'autre ne peut entrer dans la page publique.

export type RichMark = { type: "bold" } | { type: "italic" } | { type: "link"; href: string };
export type RichInline = { type: "text"; text: string; marks?: RichMark[] } | { type: "hardBreak" };
export type RichListItem = { type: "listItem"; content: RichBlock[] };
export type RichBlock =
  | { type: "paragraph"; content: RichInline[] }
  | { type: "heading"; level: 2 | 3; content: RichInline[] }
  | { type: "bulletList"; content: RichListItem[] }
  | { type: "orderedList"; content: RichListItem[] }
  | { type: "image"; src: string; alt: string };
export type RichDoc = { type: "doc"; content: RichBlock[] };

export const EMPTY_RICH_DOC: RichDoc = { type: "doc", content: [] };

/** Plafonds : un document démesuré est refusé plutôt que stocké. */
const MAX_TEXT_LENGTH = 50_000;
const MAX_NODES = 5_000;
const MAX_DEPTH = 6;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const children = (node: Json): unknown[] => (Array.isArray(node.content) ? node.content : []);

/**
 * Lien permis : http(s), mailto, ou adresse du site (« /… », pas « //… »). Les autres
 * (javascript:, data:…) sont retirés, le texte reste.
 */
export function isSafeHref(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(href);
}

/**
 * Nettoie le document envoyé par l'éditeur : seuls les éléments permis sont gardés (paragraphe,
 * intertitre de niveau 2 ou 3, listes, gras, italique, lien sûr, saut de ligne, image du
 * stockage de Pomme). Renvoie null si le document est démesuré ou n'en est pas un.
 *
 * @param imageOrigin début d'adresse des images permises (le stockage de Pomme), ou null
 */
export function cleanRichText(input: unknown, imageOrigin: string | null): RichDoc | null {
  if (!isObject(input) || input.type !== "doc") return null;
  let nodes = 0;
  let textLength = 0;
  let tooBig = false;

  const inline = (node: unknown): RichInline[] => {
    if (!isObject(node) || ++nodes > MAX_NODES) return [];
    if (node.type === "hardBreak") return [{ type: "hardBreak" }];
    if (node.type !== "text" || typeof node.text !== "string" || node.text === "") return [];
    textLength += node.text.length;
    const marks: RichMark[] = [];
    for (const mark of Array.isArray(node.marks) ? node.marks : []) {
      if (!isObject(mark)) continue;
      if (mark.type === "bold" || mark.type === "italic") marks.push({ type: mark.type });
      const href = isObject(mark.attrs) ? mark.attrs.href : undefined;
      if (mark.type === "link" && typeof href === "string" && isSafeHref(href.trim())) {
        marks.push({ type: "link", href: href.trim() });
      }
    }
    return [
      marks.length > 0
        ? { type: "text", text: node.text, marks }
        : { type: "text", text: node.text },
    ];
  };

  const block = (node: unknown, depth: number): RichBlock[] => {
    if (!isObject(node) || ++nodes > MAX_NODES) return [];
    if (depth > MAX_DEPTH) {
      tooBig = true;
      return [];
    }
    const attrs = isObject(node.attrs) ? node.attrs : {};
    switch (node.type) {
      case "paragraph":
        return [{ type: "paragraph", content: children(node).flatMap(inline) }];
      case "heading": {
        // Le titre de la page est le seul titre de niveau 1 : les intertitres sont 2 ou 3.
        const level = attrs.level === 3 ? 3 : 2;
        return [{ type: "heading", level, content: children(node).flatMap(inline) }];
      }
      case "bulletList":
      case "orderedList": {
        const items = children(node).flatMap((item): RichListItem[] => {
          if (!isObject(item) || item.type !== "listItem") return [];
          return [
            { type: "listItem", content: children(item).flatMap((b) => block(b, depth + 1)) },
          ];
        });
        return items.length > 0 ? [{ type: node.type, content: items }] : [];
      }
      case "image": {
        const src = typeof attrs.src === "string" ? attrs.src : "";
        if (!imageOrigin || !src.startsWith(imageOrigin)) return [];
        const alt =
          typeof attrs.alt === "string" ? attrs.alt.trim().slice(0, PAGE_LIMITS.imageAlt) : "";
        return [{ type: "image", src, alt }];
      }
      default:
        return [];
    }
  };

  const content = children(input).flatMap((b) => block(b, 1));
  if (tooBig || nodes > MAX_NODES || textLength > MAX_TEXT_LENGTH) return null;
  return { type: "doc", content };
}

/** Le texte brut du document (description par défaut, recherche). */
export function richTextPlain(doc: RichDoc): string {
  const inlineText = (items: RichInline[]) =>
    items.map((i) => (i.type === "text" ? i.text : " ")).join("");
  const blockText = (b: RichBlock): string => {
    switch (b.type) {
      case "paragraph":
      case "heading":
        return inlineText(b.content);
      case "bulletList":
      case "orderedList":
        return b.content.map((item) => item.content.map(blockText).join(" ")).join(" ");
      case "image":
        return "";
    }
  };
  return doc.content.map(blockText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Titre et description de partage (Open Graph, balises title et meta description) : ceux
 * saisis, sinon le titre de la page et son résumé, ou le début du texte (160 caractères).
 */
export function shareTexts(page: {
  title: string;
  summary: string;
  ogTitle: string;
  ogDescription: string;
  body: RichDoc;
}): { title: string; description: string } {
  const title = page.ogTitle.trim() || page.title.trim();
  const fallback = page.summary.trim() || richTextPlain(page.body);
  const description =
    page.ogDescription.trim() ||
    (fallback.length > PAGE_LIMITS.ogDescription
      ? `${fallback.slice(0, PAGE_LIMITS.ogDescription - 1).trimEnd()}…`
      : fallback);
  return { title, description };
}

/**
 * Sous-pages d'une page principale, dans l'ordre choisi : par date de publication, la plus
 * récente d'abord (blog), ou dans l'ordre manuel.
 */
export function sortChildren<
  T extends { publishedOn: string | null; position: number; title: string },
>(pages: readonly T[], order: ChildrenOrder): T[] {
  return [...pages].sort((a, b) =>
    order === "manual"
      ? a.position - b.position || a.title.localeCompare(b.title, "fr")
      : (b.publishedOn ?? "").localeCompare(a.publishedOn ?? "") ||
        a.title.localeCompare(b.title, "fr"),
  );
}

/**
 * Déplace une page principale dans le menu (flèches « avancer » ou « reculer »). Renvoie le
 * nouvel ordre des identifiants, ou le même si le déplacement sort de la liste.
 */
export function moveInMenu(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
