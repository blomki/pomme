import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { PublicPageView } from "@/ui/pages/PublicPageView";

import { requireAmap } from "../../../../_components/AmapThemeBoundary";
import { loadPublicPage, pageMetadata } from "../../../../_components/public-pages";

type Props = { params: Promise<{ amap: string; page: string; child: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { amap: slug, page, child } = await params;
  const amap = await requireAmap(slug);
  const found = await loadPublicPage(amap.id, [page, child]);
  return found.status === "found" ? pageMetadata(amap, found.page) : {};
}

// Sous-page du site public (billet de blog…) : [domaine]/<amap>/<page>/<sous-page> (story H2).
export default async function PublicChildPage({ params }: Props) {
  const { amap: slug, page, child } = await params;
  const amap = await requireAmap(slug);
  const found = await loadPublicPage(amap.id, [page, child]);
  if (found.status === "moved") permanentRedirect(`/${amap.slug}${found.path}`);
  if (found.status === "not_found") notFound();
  return <PublicPageView amapSlug={amap.slug} page={found.page} />;
}
