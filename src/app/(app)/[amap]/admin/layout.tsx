import type { ReactNode } from "react";

import { requireAmap } from "../../../_components/AmapThemeBoundary";
import { DesktopShell } from "@/ui/layout/DesktopShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espace administrateur : gabarit ordinateur, menu latéral.
export default async function AdminLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  return (
    <DesktopShell title={amap.name} area="admin" amapSlug={slug}>
      {children}
    </DesktopShell>
  );
}
