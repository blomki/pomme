import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { withAmapContext, type AmapContext } from "@/db/context";
import { page } from "@/db/schema";
import { uuidv7 } from "@/db/uuid";
import { ForbiddenError, SecondFactorRequiredError } from "@/server/auth/errors";
import {
  findPublicPage,
  getPageForEdit,
  getPublicSite,
  latestPublishedPost,
  listPagesForAdmin,
  movePageInMenu,
  savePage,
  setPageInMenu,
} from "@/server/pages";

import { startDatabase, type TestDatabase } from "./helpers/database";
import { fixtures } from "./helpers/fixtures";

const STORAGE = "https://stockage.example.org/pomme/";
const NOW = new Date("2026-11-21T10:00:00Z");
const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

// Pages du site public (story H2), avec la vraie base et la RLS.
describe("Pages du site (H2)", () => {
  let db: TestDatabase;
  let amapA: { id: string };
  let amapB: { id: string };
  let admin: { id: string };
  let referent: { id: string };
  let homeId: string;
  let blogId: string;
  let postId: string;

  const as = (
    userId: string | null,
    secondFactorVerified = true,
    amapId = amapA.id,
  ): AmapContext => ({
    amapId,
    userId,
    secondFactorVerified,
  });
  const run = <T>(ctx: AmapContext, fn: Parameters<typeof withAmapContext<T>>[2]) =>
    withAmapContext(db.app, ctx, fn);
  const save = (input: Record<string, unknown>, userId = admin.id) =>
    run(as(userId), (tx, c) => savePage(tx, c, input, STORAGE, NOW));
  const visitor = <T>(fn: Parameters<typeof withAmapContext<T>>[2]) => run(as(null), fn);

  beforeAll(async () => {
    db = await startDatabase();
    const f = fixtures(db.owner);
    amapA = await f.createAmap("amap-a");
    amapB = await f.createAmap("amap-b");
    admin = await f.createUser();
    referent = await f.createUser();
    await f.grantRole(amapA.id, admin.id, "admin");
    await f.grantRole(amapA.id, referent.id, "referent");
    homeId = uuidv7();
    await db.owner.insert(page).values([
      {
        id: homeId,
        amapId: amapA.id,
        role: "home",
        title: "Accueil",
        slug: "accueil",
        inMenu: true,
      },
      { amapId: amapA.id, role: "legal", title: "Mentions légales", slug: "mentions-legales" },
      {
        amapId: amapB.id,
        role: "home",
        title: "Accueil B",
        slug: "accueil",
        status: "published",
        publishedOn: "2026-01-01",
      },
    ]);
  });

  it("l'admin crée une page principale et une sous-page, puis les publie (accès autorisé)", async () => {
    const blog = await save({
      title: "Le blog",
      slug: "blog",
      body: paragraph("Nos nouvelles"),
      inMenu: true,
    });
    expect(blog).toMatchObject({ status: "saved", pageStatus: "draft", path: "/blog" });
    if (blog.status !== "saved") return;
    blogId = blog.pageId;
    const post = await save({
      parentId: blogId,
      title: "Fête de l'été",
      slug: "fete-ete",
      summary: "Une belle fête.",
      body: paragraph("Merci à tous"),
      intent: "publish",
    });
    expect(post).toMatchObject({
      status: "saved",
      pageStatus: "published",
      path: "/blog/fete-ete",
    });
    if (post.status !== "saved") return;
    postId = post.pageId;
    const [row] = await db.owner.select().from(page).where(eq(page.id, postId));
    expect(row).toMatchObject({ publishedOn: "2026-11-21", createdBy: admin.id });

    // Brouillon : invisible du public, sous-page comprise (son parent n'est pas publié).
    expect(await visitor((tx) => findPublicPage(tx, ["blog"]))).toEqual({ status: "not_found" });
    expect(await visitor((tx) => findPublicPage(tx, ["blog", "fete-ete"]))).toEqual({
      status: "not_found",
    });
    await save({
      pageId: blogId,
      title: "Le blog",
      slug: "blog",
      body: paragraph("Nos nouvelles"),
      inMenu: true,
      intent: "publish",
    });
    const found = await visitor((tx) => findPublicPage(tx, ["blog"]));
    expect(found).toMatchObject({
      status: "found",
      page: {
        title: "Le blog",
        path: "/blog",
        children: [{ title: "Fête de l'été", path: "/blog/fete-ete" }],
      },
    });
    expect(await visitor((tx) => latestPublishedPost(tx))).toMatchObject({
      title: "Fête de l'été",
      path: "/blog/fete-ete",
    });
  });

  it("refuse une adresse prise, réservée, et plus d'un niveau de sous-pages", async () => {
    expect(await save({ title: "Autre blog", slug: "blog", body: paragraph("x") })).toEqual({
      status: "slug_taken",
    });
    expect(await save({ title: "Admin", slug: "admin", body: paragraph("x") })).toEqual({
      status: "invalid",
      problems: [{ field: "slug", problem: "reserved" }],
    });
    // Sous-page d'une sous-page, ou sous-page de l'accueil : refusé.
    expect(
      await save({ parentId: postId, title: "Trop bas", slug: "bas", body: paragraph("x") }),
    ).toEqual({
      status: "invalid",
      problems: [{ field: "parent", problem: "invalid" }],
    });
    expect(
      await save({ parentId: homeId, title: "Sous l'accueil", slug: "x", body: paragraph("x") }),
    ).toEqual({
      status: "invalid",
      problems: [{ field: "parent", problem: "invalid" }],
    });
  });

  it("nettoie le texte : un lien dangereux et une image d'ailleurs disparaissent", async () => {
    const saved = await save({
      pageId: postId,
      parentId: blogId,
      title: "Fête de l'été",
      slug: "fete-ete",
      summary: "Une belle fête.",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "clic",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
          { type: "image", attrs: { src: "https://pirate.example.com/x.png" } },
        ],
      },
    });
    expect(saved).toMatchObject({ status: "saved", pageStatus: "published" });
    const [row] = await db.owner.select({ body: page.body }).from(page).where(eq(page.id, postId));
    expect(row?.body).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "clic" }] }],
    });
  });

  it("une adresse changée après publication redirige, sous-pages comprises", async () => {
    await save({
      pageId: blogId,
      title: "Le blog",
      slug: "actualites",
      body: paragraph("Nos nouvelles"),
      inMenu: true,
    });
    expect(await visitor((tx) => findPublicPage(tx, ["blog"]))).toEqual({
      status: "moved",
      path: "/actualites",
    });
    expect(await visitor((tx) => findPublicPage(tx, ["blog", "fete-ete"]))).toEqual({
      status: "moved",
      path: "/actualites/fete-ete",
    });
    expect(await visitor((tx) => findPublicPage(tx, ["actualites", "fete-ete"]))).toMatchObject({
      status: "found",
      page: { parent: { title: "Le blog", path: "/actualites" } },
    });
  });

  it("menu : cocher, réordonner ; dépublier retire la page du site", async () => {
    const recettes = await save({
      title: "Recettes",
      slug: "recettes",
      body: paragraph("Miam"),
      intent: "publish",
    });
    if (recettes.status !== "saved") throw new Error("non enregistrée");
    await run(as(admin.id), (tx, c) =>
      setPageInMenu(tx, c, { pageId: recettes.pageId, inMenu: true }),
    );
    let list = await run(as(admin.id), (tx, c) => listPagesForAdmin(tx, c));
    expect(list.menu.map((m) => m.title)).toEqual(["Accueil", "Le blog", "Recettes"]);
    await run(as(admin.id), (tx, c) =>
      movePageInMenu(tx, c, { pageId: recettes.pageId, delta: -1 }),
    );
    list = await run(as(admin.id), (tx, c) => listPagesForAdmin(tx, c));
    expect(list.menu.map((m) => m.title)).toEqual(["Accueil", "Recettes", "Le blog"]);
    // Le menu public ne montre que les pages publiées (l'accueil est encore en brouillon).
    expect((await visitor((tx) => getPublicSite(tx))).menu).toEqual([
      { title: "Recettes", path: "/recettes" },
      { title: "Le blog", path: "/actualites" },
    ]);
    await save({
      pageId: recettes.pageId,
      title: "Recettes",
      slug: "recettes",
      body: paragraph("Miam"),
      inMenu: true,
      intent: "unpublish",
    });
    expect(await visitor((tx) => findPublicPage(tx, ["recettes"]))).toEqual({
      status: "not_found",
    });
    // L'accueil, obligatoire, ne se dépublie pas.
    expect(
      await save({
        pageId: homeId,
        title: "Accueil",
        slug: "accueil",
        body: paragraph("x"),
        intent: "unpublish",
      }),
    ).toEqual({ status: "invalid", problems: [{ field: "status", problem: "required_page" }] });
    // Dépubliée, jamais supprimée : toujours dans la liste de l'admin.
    list = await run(as(admin.id), (tx, c) => listPagesForAdmin(tx, c));
    expect(list.pages.find((p) => p.title === "Recettes")?.status).toBe("unpublished");
    expect(list.pages[0]?.role).toBe("home");
  });

  it("refuse le référent, l'admin sans deuxième vérification et les autres AMAP (accès refusé)", async () => {
    await expect(
      save({ title: "Pirate", slug: "pirate", body: paragraph("x") }, referent.id),
    ).rejects.toThrow(ForbiddenError);
    await expect(run(as(referent.id), (tx, c) => listPagesForAdmin(tx, c))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      run(as(admin.id, false), (tx, c) => getPageForEdit(tx, c, { pageId: blogId })),
    ).rejects.toThrow(SecondFactorRequiredError);
    // Un visiteur ne lit pas un brouillon, même directement dans la base.
    const drafts = await visitor((tx) => tx.select().from(page).where(eq(page.status, "draft")));
    expect(drafts).toEqual([]);
    // Ni écrire une page.
    await expect(
      visitor((tx) => tx.insert(page).values({ amapId: amapA.id, title: "x", slug: "x" })),
    ).rejects.toThrow();
    // Les pages de l'AMAP B ne se lisent pas depuis l'AMAP A.
    const others = await visitor((tx) => tx.select().from(page).where(eq(page.amapId, amapB.id)));
    expect(others).toEqual([]);
  });
});
