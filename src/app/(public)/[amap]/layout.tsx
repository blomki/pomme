import type { ReactNode } from "react";

import { AmapThemeBoundary, requireAmap } from "../../_components/AmapThemeBoundary";
import { loadPublicSite } from "../../_components/public-pages";
import { PublicSiteShell } from "@/ui/pages/PublicSiteShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Site public d'une AMAP (story H2) : son thème, son menu (pages publiées cochées « Dans le
// menu ») et le lien des mentions légales. Rendu côté serveur.
export default async function AmapPublicLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  const site = await loadPublicSite(amap.id);
  return (
    <AmapThemeBoundary slug={slug}>
      <PublicSiteShell
        amap={{ slug: amap.slug, name: amap.name, logoUrl: amap.logoUrl }}
        menu={site.menu}
        legalPath={site.legalPath}
      >
        {children}
      </PublicSiteShell>
    </AmapThemeBoundary>
  );
}
