import type { Metadata } from "next";
import { cache } from "react";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { shareTexts } from "@/domain/pages";
import type { PublicAmap } from "@/server/amap";
import { findPublicPage, getPublicSite, type PublicPage } from "@/server/pages";

// Lectures du site public d'une AMAP (story H2) : sans compte, dans le contexte de l'AMAP de
// l'adresse ; la Row Level Security ne montre que les pages publiées.

const asVisitor = (amapId: string) => ({ amapId, userId: null });

/** Menu et pied de page. cache() : la mise en page et les pages le lisent pour la même requête. */
export const loadPublicSite = cache((amapId: string) =>
  withAmapContext(getDatabase(), asVisitor(amapId), (tx) => getPublicSite(tx)),
);

/** Page publiée d'après son chemin (voir findPublicPage). */
export const loadPublicPage = cache((amapId: string, segments: string[]) =>
  withAmapContext(getDatabase(), asVisitor(amapId), (tx) => findPublicPage(tx, segments)),
);

/**
 * Balises de partage et de référencement d'une page : titre et description saisis, sinon le
 * titre et le résumé (ou le début du texte) ; image principale, sinon le logo de l'AMAP.
 */
export function pageMetadata(amap: PublicAmap, page: PublicPage): Metadata {
  const { title, description } = shareTexts(page);
  const image = page.imageUrl ?? amap.logoUrl;
  const fullTitle = page.role === "home" ? amap.name : `${title} · ${amap.name}`;
  return {
    title: fullTitle,
    description: description || undefined,
    openGraph: {
      title,
      description: description || undefined,
      siteName: amap.name,
      locale: "fr_FR",
      type: page.parent ? "article" : "website",
      url: `/${amap.slug}${page.path}`,
      ...(image
        ? { images: [{ url: image, alt: page.imageUrl ? page.imageAlt : amap.name }] }
        : {}),
    },
  };
}
