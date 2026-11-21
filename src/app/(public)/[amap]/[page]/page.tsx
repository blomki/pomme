import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { PublicPageView } from "@/ui/pages/PublicPageView";

import { requireAmap } from "../../../_components/AmapThemeBoundary";
import { loadPublicPage, pageMetadata } from "../../../_components/public-pages";

type Props = { params: Promise<{ amap: string; page: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { amap: slug, page } = await params;
  const amap = await requireAmap(slug);
  const found = await loadPublicPage(amap.id, [page]);
  return found.status === "found" ? pageMetadata(amap, found.page) : {};
}

// Page principale du site public : [domaine]/<amap>/<page> (story H2). Une ancienne adresse
// redirige définitivement vers la nouvelle.
export default async function PublicTopPage({ params }: Props) {
  const { amap: slug, page } = await params;
  const amap = await requireAmap(slug);
  const found = await loadPublicPage(amap.id, [page]);
  if (found.status === "moved") permanentRedirect(`/${amap.slug}${found.path}`);
  if (found.status === "not_found") notFound();
  return <PublicPageView amapSlug={amap.slug} page={found.page} />;
}
