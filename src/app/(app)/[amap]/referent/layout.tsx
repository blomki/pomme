import type { ReactNode } from "react";

import { requireAmap } from "../../../_components/AmapThemeBoundary";
import { getCurrentSession } from "@/server/auth/session";
import { deskAreasIn } from "@/server/spaces";
import { DesktopShell } from "@/ui/layout/DesktopShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espace référent : gabarit ordinateur, menu latéral.
export default async function ReferentLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  const session = await getCurrentSession();
  const switchAreas = await deskAreasIn(session?.user.id, slug);
  return (
    <DesktopShell title={amap.name} area="referent" amapSlug={slug} switchAreas={switchAreas}>
      {children}
    </DesktopShell>
  );
}
