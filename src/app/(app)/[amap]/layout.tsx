import type { ReactNode } from "react";

import { AmapThemeBoundary } from "../../_components/AmapThemeBoundary";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espaces connectés d'une AMAP : thème de l'AMAP. Chaque espace choisit ensuite son gabarit.
export default async function AmapAppLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  return <AmapThemeBoundary slug={slug}>{children}</AmapThemeBoundary>;
}
