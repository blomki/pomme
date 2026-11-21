import type { Metadata } from "next";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { getPublicHome } from "@/server/pages";
import { PublicHomeView } from "@/ui/pages/PublicPageView";

import { requireAmap } from "../../_components/AmapThemeBoundary";
import { loadPublicPage, pageMetadata } from "../../_components/public-pages";

type Props = { params: Promise<{ amap: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const amap = await requireAmap((await params).amap);
  const found = await loadPublicPage(amap.id, []);
  return found.status === "found" ? pageMetadata(amap, found.page) : { title: amap.name };
}

// Accueil du site public d'une AMAP ([domaine]/<amap>, story H2) : la page d'accueil si elle
// est publiée, puis les blocs remplis automatiquement (distribution, producteurs, billet).
export default async function AmapPublicPage({ params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  const found = await loadPublicPage(amap.id, []);
  const home = await withAmapContext(getDatabase(), { amapId: amap.id, userId: null }, (tx) =>
    getPublicHome(tx, amap.id),
  );
  return (
    <PublicHomeView
      amap={{ slug: amap.slug, name: amap.name }}
      page={found.status === "found" ? found.page : null}
      home={home}
    />
  );
}
