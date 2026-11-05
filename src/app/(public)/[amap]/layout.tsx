import type { ReactNode } from "react";

import { AmapThemeBoundary, requireAmap } from "../../_components/AmapThemeBoundary";
import { MobileShell } from "@/ui/layout/MobileShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Page publique d'une AMAP : son thème et son nom en haut de page.
export default async function AmapPublicLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  return (
    <AmapThemeBoundary slug={slug}>
      <MobileShell title={amap.name}>{children}</MobileShell>
    </AmapThemeBoundary>
  );
}
