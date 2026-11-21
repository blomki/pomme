import { and, asc, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amap, amapProducer, distribution, page, pageRedirect, producer } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { checkUpload, IMAGE_USAGES, MAX_UPLOAD_BYTES, type UploadProblem } from "@/domain/images";
import { parisDay } from "@/domain/order-periods";
import {
  CHILDREN_ORDERS,
  checkPageFields,
  cleanRichText,
  EMPTY_RICH_DOC,
  pagePath,
  sortChildren,
  moveInMenu as moveId,
  type ChildrenOrder,
  type PageFieldsProblem,
  type PageRole,
  type PageStatus,
  type RichDoc,
} from "@/domain/pages";

import { requireRole } from "./auth/require-role";
import { uniqueViolation } from "./db-errors";
import { reencodeImage } from "./files/images";
import type { FileStore } from "./files/storage";

// Pages du site public (story H2, ADR 0033). Écriture réservée aux admins de l'AMAP
// (requireRole, et la Row Level Security) ; lecture des pages publiées par tout le monde.

type PageRow = typeof page.$inferSelect;

export type AdminPageRow = {
  id: string;
  parentId: string | null;
  role: PageRole | null;
  title: string;
  path: string;
  status: PageStatus;
  publishedOn: string | null;
  updatedAt: Date;
  inMenu: boolean;
  /** Sous-pages, dans l'ordre choisi (pages principales seulement). */
  children: AdminPageRow[];
};

export type AdminPages = {
  /** Pages principales, l'accueil d'abord, puis par titre. */
  pages: AdminPageRow[];
  /** Pages du menu, dans l'ordre. */
  menu: Array<{ id: string; title: string }>;
};

const toAdminRow = (p: PageRow, parentSlug: string | null): AdminPageRow => ({
  id: p.id,
  parentId: p.parentId,
  role: p.role,
  title: p.title,
  path: pagePath({ role: p.role, slug: p.slug, parentSlug }),
  status: p.status,
  publishedOn: p.publishedOn,
  updatedAt: p.updatedAt,
  inMenu: p.inMenu,
  children: [],
});

const menuOrder = (a: PageRow, b: PageRow) =>
  a.menuPosition - b.menuPosition || a.title.localeCompare(b.title, "fr");

/** Liste des pages pour l'écran « Pages » : arbre à un niveau et menu du site. */
export async function listPagesForAdmin(tx: Transaction, ctx: AmapContext): Promise<AdminPages> {
  await requireRole(tx, ctx, ["admin"]);
  const rows = await tx.select().from(page);
  const tops = rows
    .filter((p) => p.parentId === null)
    .sort(
      (a, b) =>
        Number(b.role === "home") - Number(a.role === "home") ||
        Number(a.role === "legal") - Number(b.role === "legal") ||
        a.title.localeCompare(b.title, "fr"),
    );
  return {
    pages: tops.map((top) => ({
      ...toAdminRow(top, null),
      children: sortChildren(
        rows.filter((p) => p.parentId === top.id),
        top.childrenOrder,
      ).map((child) => toAdminRow(child, top.slug)),
    })),
    menu: tops
      .filter((p) => p.inMenu)
      .sort(menuOrder)
      .map((p) => ({ id: p.id, title: p.title })),
  };
}

export type PageEditView = {
  id: string | null;
  parent: { id: string; title: string; slug: string } | null;
  role: PageRole | null;
  title: string;
  slug: string;
  summary: string;
  body: RichDoc;
  imageUrl: string | null;
  imageAlt: string;
  status: PageStatus;
  publishedOn: string | null;
  inMenu: boolean;
  childrenOrder: ChildrenOrder;
  ogTitle: string;
  ogDescription: string;
  /** Pages principales qui peuvent recevoir une sous-page (ni l'accueil ni les mentions). */
  parents: Array<{ id: string; title: string; slug: string }>;
  /** A des sous-pages : ne peut pas devenir elle-même une sous-page. */
  hasChildren: boolean;
};

async function possibleParents(tx: Transaction, exceptId: string | null) {
  const rows = await tx
    .select({ id: page.id, title: page.title, slug: page.slug })
    .from(page)
    .where(
      and(isNull(page.parentId), isNull(page.role), exceptId ? ne(page.id, exceptId) : undefined),
    )
    .orderBy(asc(page.title));
  return rows;
}

/** Page à modifier, ou valeurs d'une nouvelle page (sous `parentId` s'il est donné). */
export async function getPageForEdit(
  tx: Transaction,
  ctx: AmapContext,
  input: { pageId?: string; parentId?: string },
): Promise<PageEditView | null> {
  await requireRole(tx, ctx, ["admin"]);
  const parents = await possibleParents(tx, input.pageId ?? null);
  if (!input.pageId) {
    const parent = parents.find((p) => p.id === input.parentId) ?? null;
    return {
      id: null,
      parent,
      role: null,
      title: "",
      slug: "",
      summary: "",
      body: EMPTY_RICH_DOC,
      imageUrl: null,
      imageAlt: "",
      status: "draft",
      publishedOn: null,
      inMenu: false,
      childrenOrder: "date_desc",
      ogTitle: "",
      ogDescription: "",
      parents,
      hasChildren: false,
    };
  }
  if (!z.uuid().safeParse(input.pageId).success) return null;
  const [row] = await tx.select().from(page).where(eq(page.id, input.pageId));
  if (!row) return null;
  const [child] = await tx
    .select({ id: page.id })
    .from(page)
    .where(eq(page.parentId, row.id))
    .limit(1);
  const [parent] = row.parentId
    ? await tx
        .select({ id: page.id, title: page.title, slug: page.slug })
        .from(page)
        .where(eq(page.id, row.parentId))
    : [];
  return {
    id: row.id,
    parent: parent ?? null,
    role: row.role,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    body: row.body,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    status: row.status,
    publishedOn: row.publishedOn,
    inMenu: row.inMenu,
    childrenOrder: row.childrenOrder,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    parents,
    hasChildren: Boolean(child),
  };
}

const saveSchema = z.object({
  pageId: z.uuid().optional(),
  parentId: z.uuid().nullable().default(null),
  title: z.string(),
  slug: z.string().trim(),
  summary: z.string().default(""),
  body: z.unknown(),
  imageUrl: z.string().nullable().default(null),
  imageAlt: z.string().default(""),
  inMenu: z.boolean().default(false),
  childrenOrder: z.enum(CHILDREN_ORDERS).default("date_desc"),
  publishedOn: z.iso.date().nullable().default(null),
  ogTitle: z.string().default(""),
  ogDescription: z.string().default(""),
  /** Enregistrer (statut inchangé), publier, ou dépublier. */
  intent: z.enum(["save", "publish", "unpublish"]).default("save"),
});

export type SavePageProblem =
  | PageFieldsProblem
  | { field: "body" | "parent" | "imageUrl"; problem: "invalid" }
  // Accueil et mentions légales : obligatoires, ils ne se dépublient pas.
  | { field: "status"; problem: "required_page" };

export type SavePageResult =
  | { status: "saved"; pageId: string; pageStatus: PageStatus; path: string }
  | { status: "invalid"; problems: SavePageProblem[] }
  | { status: "slug_taken" }
  | { status: "not_found" };

/**
 * Crée ou modifie une page. Le texte est nettoyé (seuls les éléments permis restent). Une page
 * publiée dont l'adresse change laisse une redirection depuis l'ancienne, ses sous-pages aussi.
 * `imageOrigin` : début d'adresse des images permises (le stockage), ou null.
 */
export async function savePage(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  imageOrigin: string | null,
  now = new Date(),
): Promise<SavePageResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", problems: [] };
  const data = parsed.data;

  const [before] = data.pageId
    ? await tx.select().from(page).where(eq(page.id, data.pageId))
    : [undefined];
  if (data.pageId && !before) return { status: "not_found" };
  // Accueil et mentions légales restent des pages principales.
  const parentId = before?.role ? null : data.parentId;

  const problems: SavePageProblem[] = checkPageFields({
    title: data.title,
    summary: data.summary,
    // L'adresse de l'accueil ne sert pas (c'est l'adresse de l'AMAP) : elle ne change pas.
    slug: before?.role === "home" ? before.slug : data.slug,
    isTopLevel: parentId === null,
    ogTitle: data.ogTitle,
    ogDescription: data.ogDescription,
    imageAlt: data.imageAlt,
  });
  const body = cleanRichText(data.body ?? EMPTY_RICH_DOC, imageOrigin);
  if (!body) problems.push({ field: "body", problem: "invalid" });
  if (data.imageUrl && (!imageOrigin || !data.imageUrl.startsWith(imageOrigin))) {
    problems.push({ field: "imageUrl", problem: "invalid" });
  }

  let parent: PageRow | undefined;
  if (parentId) {
    [parent] = await tx.select().from(page).where(eq(page.id, parentId));
    // Un seul niveau : le parent est une page principale ordinaire, et la page n'a pas
    // elle-même de sous-pages.
    const [child] = before
      ? await tx.select({ id: page.id }).from(page).where(eq(page.parentId, before.id)).limit(1)
      : [];
    if (!parent || parent.parentId !== null || parent.role !== null || child) {
      problems.push({ field: "parent", problem: "invalid" });
    }
  }
  if (data.intent === "unpublish" && before?.role) {
    problems.push({ field: "status", problem: "required_page" });
  }
  if (problems.length > 0) return { status: "invalid", problems };

  const status: PageStatus =
    data.intent === "publish"
      ? "published"
      : data.intent === "unpublish"
        ? "unpublished"
        : (before?.status ?? "draft");
  const publishedOn =
    status === "published"
      ? (data.publishedOn ?? before?.publishedOn ?? parisDay(now))
      : data.publishedOn;
  const slug = before?.role === "home" ? before.slug : data.slug;

  // Position des nouvelles pages : à la fin du menu, et à la fin des sous-pages.
  const siblings = await tx
    .select({ id: page.id, menuPosition: page.menuPosition, position: page.position })
    .from(page)
    .where(parentId ? eq(page.parentId, parentId) : isNull(page.parentId));
  const last = (key: "menuPosition" | "position") =>
    siblings.reduce((max, s) => Math.max(max, s[key]), 0) + 1;

  const values = {
    parentId,
    title: data.title.trim(),
    slug,
    summary: data.summary.trim(),
    body: body!,
    imageUrl: data.imageUrl,
    imageAlt: data.imageAlt.trim(),
    status,
    publishedOn,
    inMenu: parentId === null && data.inMenu,
    childrenOrder: data.childrenOrder,
    ogTitle: data.ogTitle.trim(),
    ogDescription: data.ogDescription.trim(),
    updatedBy: ctx.userId,
  };
  const id = before?.id ?? uuidv7();
  try {
    await tx.transaction(async (sub) => {
      if (before) {
        await sub
          .update(page)
          .set({
            ...values,
            ...(values.inMenu && !before.inMenu ? { menuPosition: last("menuPosition") } : {}),
          })
          .where(eq(page.id, before.id));
      } else {
        await sub.insert(page).values({
          id,
          amapId: ctx.amapId!,
          ...values,
          menuPosition: last("menuPosition"),
          position: last("position"),
          createdBy: ctx.userId,
        });
      }
    });
  } catch (error) {
    if (uniqueViolation(error) === "page_slug_unique") return { status: "slug_taken" };
    throw error;
  }

  const newPath = pagePath({ role: before?.role ?? null, slug, parentSlug: parent?.slug ?? null });
  if (before) {
    const [oldParent] = before.parentId
      ? await tx.select({ slug: page.slug }).from(page).where(eq(page.id, before.parentId))
      : [];
    const oldPath = pagePath({
      role: before.role,
      slug: before.slug,
      parentSlug: oldParent?.slug ?? null,
    });
    // Déjà publiée (une fois au moins) et adresse changée : l'ancienne adresse redirige.
    if (before.publishedOn && oldPath !== newPath && before.role !== "home") {
      await addRedirect(tx, ctx, id, oldPath);
      // Les sous-pages d'une page principale changent d'adresse avec elle.
      if (before.parentId === null && before.slug !== slug) {
        const children = await tx.select().from(page).where(eq(page.parentId, id));
        for (const child of children.filter((c) => c.publishedOn)) {
          await addRedirect(tx, ctx, child.id, `/${before.slug}/${child.slug}`);
          await dropRedirect(tx, `/${slug}/${child.slug}`);
        }
      }
    }
  }
  // Une page qui (re)prend une adresse : l'ancienne redirection de cette adresse n'a plus lieu.
  await dropRedirect(tx, newPath);
  return { status: "saved", pageId: id, pageStatus: status, path: newPath };
}

async function addRedirect(tx: Transaction, ctx: AmapContext, pageId: string, fromPath: string) {
  await tx
    .insert(pageRedirect)
    .values({ amapId: ctx.amapId!, pageId, fromPath })
    .onConflictDoUpdate({ target: [pageRedirect.amapId, pageRedirect.fromPath], set: { pageId } });
}

async function dropRedirect(tx: Transaction, fromPath: string) {
  await tx.delete(pageRedirect).where(eq(pageRedirect.fromPath, fromPath));
}

/** Coche ou décoche « Dans le menu » pour une page principale (ajoutée à la fin du menu). */
export async function setPageInMenu(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<{ status: "saved" | "not_found" | "invalid" }> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = z.object({ pageId: z.uuid(), inMenu: z.boolean() }).safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const tops = await tx.select().from(page).where(isNull(page.parentId));
  const target = tops.find((p) => p.id === parsed.data.pageId);
  if (!target) return { status: "not_found" };
  const end = tops.filter((p) => p.inMenu).reduce((max, p) => Math.max(max, p.menuPosition), 0) + 1;
  await tx
    .update(page)
    .set({
      inMenu: parsed.data.inMenu,
      ...(parsed.data.inMenu && !target.inMenu ? { menuPosition: end } : {}),
    })
    .where(eq(page.id, target.id));
  return { status: "saved" };
}

/** Avance (-1) ou recule (+1) une page dans le menu du site. */
export async function movePageInMenu(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<{ status: "saved" | "not_found" | "invalid" }> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = z
    .object({ pageId: z.uuid(), delta: z.union([z.literal(-1), z.literal(1)]) })
    .safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const menu = (
    await tx
      .select()
      .from(page)
      .where(and(isNull(page.parentId), eq(page.inMenu, true)))
  )
    .sort(menuOrder)
    .map((p) => p.id);
  if (!menu.includes(parsed.data.pageId)) return { status: "not_found" };
  const ordered = moveId(menu, parsed.data.pageId, parsed.data.delta);
  for (const [index, id] of ordered.entries()) {
    await tx
      .update(page)
      .set({ menuPosition: index + 1 })
      .where(eq(page.id, id));
  }
  return { status: "saved" };
}

export type UploadPageImageResult =
  { status: "saved"; url: string } | { status: UploadProblem | "no_file" | "unavailable" };

/**
 * Envoie une image de page (image principale ou photo dans le texte) : contrôlée, ré-encodée,
 * rangée dans le stockage. Elle n'est rattachée à la page qu'à l'enregistrement.
 */
export async function uploadPageImage(
  tx: Transaction,
  ctx: AmapContext,
  input: { file: Blob | null },
  store: FileStore | null,
): Promise<UploadPageImageResult> {
  await requireRole(tx, ctx, ["admin"]);
  if (!store) return { status: "unavailable" };
  if (!input.file || input.file.size === 0) return { status: "no_file" };
  if (input.file.size > MAX_UPLOAD_BYTES) return { status: "too_large" };
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const problem = checkUpload({ size: bytes.length, head: bytes.subarray(0, 16) });
  if (problem) return { status: problem };
  let image;
  try {
    image = await reencodeImage(bytes, "page_image");
  } catch {
    return { status: "not_image" };
  }
  const key = `${IMAGE_USAGES.page_image.folder}/${uuidv7()}.webp`;
  await store.put(key, image.body, image.contentType);
  return { status: "saved", url: store.publicUrl(key) };
}

// --- Site public -------------------------------------------------------------------------------

export type PublicPage = {
  id: string;
  role: PageRole | null;
  title: string;
  summary: string;
  body: RichDoc;
  imageUrl: string | null;
  imageAlt: string;
  publishedOn: string | null;
  ogTitle: string;
  ogDescription: string;
  path: string;
  parent: { title: string; path: string } | null;
  /** Sous-pages publiées (page principale), dans l'ordre choisi. */
  children: Array<{
    title: string;
    summary: string;
    path: string;
    publishedOn: string | null;
    imageUrl: string | null;
    imageAlt: string;
  }>;
};

export type PublicSite = {
  menu: Array<{ title: string; path: string }>;
  /** Mentions légales, si elles sont publiées. */
  legalPath: string | null;
};

/**
 * Menu et pied de page du site public : pages principales publiées cochées « Dans le menu »,
 * dans l'ordre, et lien des mentions légales. Lecture sans compte (contexte de l'AMAP seul).
 */
export async function getPublicSite(tx: Transaction): Promise<PublicSite> {
  const tops = await tx
    .select()
    .from(page)
    .where(and(isNull(page.parentId), eq(page.status, "published")));
  const legal = tops.find((p) => p.role === "legal");
  return {
    menu: tops
      .filter((p) => p.inMenu)
      .sort(menuOrder)
      .map((p) => ({
        title: p.title,
        path: pagePath({ role: p.role, slug: p.slug, parentSlug: null }),
      })),
    legalPath: legal ? pagePath({ role: "legal", slug: legal.slug, parentSlug: null }) : null,
  };
}

export type PublicLookup =
  | { status: "found"; page: PublicPage }
  | { status: "moved"; path: string }
  | { status: "not_found" };

/**
 * Page publiée d'après son chemin : [] (accueil), [page] ou [page, sous-page]. Une ancienne
 * adresse renvoie la nouvelle (redirection permanente).
 */
export async function findPublicPage(tx: Transaction, segments: string[]): Promise<PublicLookup> {
  const published = eq(page.status, "published");
  let found: PageRow | undefined;
  let parent: PageRow | undefined;
  if (segments.length === 0) {
    [found] = await tx
      .select()
      .from(page)
      .where(and(eq(page.role, "home"), published));
  } else if (segments.length <= 2) {
    [parent] = await tx
      .select()
      .from(page)
      .where(and(isNull(page.parentId), eq(page.slug, segments[0]!), published));
    if (segments.length === 1) {
      // L'accueil se lit à l'adresse de l'AMAP, pas sous « /accueil ».
      found = parent?.role === "home" ? undefined : parent;
      parent = undefined;
    } else if (parent) {
      [found] = await tx
        .select()
        .from(page)
        .where(and(eq(page.parentId, parent.id), eq(page.slug, segments[1]!), published));
    }
  }
  if (!found) {
    if (segments.length === 0) return { status: "not_found" };
    const [redirect] = await tx
      .select({ pageId: pageRedirect.pageId })
      .from(pageRedirect)
      .where(eq(pageRedirect.fromPath, `/${segments.join("/")}`));
    if (!redirect) return { status: "not_found" };
    const [target] = await tx
      .select()
      .from(page)
      .where(and(eq(page.id, redirect.pageId), published));
    if (!target) return { status: "not_found" };
    const [targetParent] = target.parentId
      ? await tx.select({ slug: page.slug }).from(page).where(eq(page.id, target.parentId))
      : [];
    return {
      status: "moved",
      path: pagePath({
        role: target.role,
        slug: target.slug,
        parentSlug: targetParent?.slug ?? null,
      }),
    };
  }

  const path = pagePath({ role: found.role, slug: found.slug, parentSlug: parent?.slug ?? null });
  const children =
    found.parentId === null
      ? sortChildren(
          await tx
            .select()
            .from(page)
            .where(and(eq(page.parentId, found.id), published)),
          found.childrenOrder,
        )
      : [];
  return {
    status: "found",
    page: {
      id: found.id,
      role: found.role,
      title: found.title,
      summary: found.summary,
      body: found.body,
      imageUrl: found.imageUrl,
      imageAlt: found.imageAlt,
      publishedOn: found.publishedOn,
      ogTitle: found.ogTitle,
      ogDescription: found.ogDescription,
      path,
      parent: parent
        ? {
            title: parent.title,
            path: pagePath({ role: parent.role, slug: parent.slug, parentSlug: null }),
          }
        : null,
      children: children.map((c) => ({
        title: c.title,
        summary: c.summary,
        path: `${path}/${c.slug}`,
        publishedOn: c.publishedOn,
        imageUrl: c.imageUrl,
        imageAlt: c.imageAlt,
      })),
    },
  };
}

/** Dernière sous-page publiée (billet de blog), pour l'accueil. */
export async function latestPublishedPost(tx: Transaction): Promise<{
  title: string;
  summary: string;
  path: string;
  publishedOn: string | null;
} | null> {
  const parents = await tx
    .select({ id: page.id, slug: page.slug })
    .from(page)
    .where(and(isNull(page.parentId), eq(page.status, "published")));
  if (parents.length === 0) return null;
  const [post] = await tx
    .select()
    .from(page)
    .where(
      and(
        eq(page.status, "published"),
        inArray(
          page.parentId,
          parents.map((p) => p.id),
        ),
      ),
    )
    .orderBy(desc(page.publishedOn), desc(page.createdAt))
    .limit(1);
  if (!post) return null;
  const parentSlug = parents.find((p) => p.id === post.parentId)!.slug;
  return {
    title: post.title,
    summary: post.summary,
    path: `/${parentSlug}/${post.slug}`,
    publishedOn: post.publishedOn,
  };
}

export type PublicHome = {
  /** Producteurs qui livrent l'AMAP en ce moment, par nom. */
  producers: Array<{
    name: string;
    category: string;
    shortDescription: string;
    photoUrl: string | null;
    photoAlt: string;
  }>;
  nextDistribution: {
    date: string;
    startTime: string;
    endTime: string;
    place: string | null;
  } | null;
  latestPost: Awaited<ReturnType<typeof latestPublishedPost>>;
};

/**
 * Blocs remplis automatiquement sur l'accueil : cartes des producteurs, prochaine distribution
 * (aujourd'hui compris), dernier billet publié. Informations publiques de l'AMAP.
 */
export async function getPublicHome(
  tx: Transaction,
  amapId: string,
  now = new Date(),
): Promise<PublicHome> {
  const producers = await tx
    .select({
      name: producer.name,
      category: producer.category,
      shortDescription: producer.shortDescription,
      photoUrl: producer.photoUrl,
      photoAlt: producer.photoAlt,
    })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(and(eq(amapProducer.active, true), isNull(amapProducer.archivedAt)))
    .orderBy(asc(producer.name));
  const [next] = await tx
    .select({
      date: distribution.date,
      startTime: distribution.startTime,
      endTime: distribution.endTime,
    })
    .from(distribution)
    .where(and(eq(distribution.isOpen, true), gte(distribution.date, parisDay(now))))
    .orderBy(asc(distribution.date))
    .limit(1);
  const [place] = await tx
    .select({ place: amap.distributionPlace })
    .from(amap)
    .where(eq(amap.id, amapId));
  return {
    producers,
    nextDistribution: next
      ? {
          date: next.date,
          startTime: next.startTime.slice(0, 5),
          endTime: next.endTime.slice(0, 5),
          place: place?.place ?? null,
        }
      : null,
    latestPost: await latestPublishedPost(tx),
  };
}
