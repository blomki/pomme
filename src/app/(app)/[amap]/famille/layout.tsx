import type { ReactNode } from "react";

import { requireAmap } from "../../../_components/AmapThemeBoundary";
import { FamilyBottomNavigation } from "@/ui/layout/FamilyBottomNavigation";
import { MobileShell } from "@/ui/layout/MobileShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espace famille : gabarit mobile, barre du bas Accueil / Chèques / Profil (écran 1).
export default async function FamilyLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  return (
    <MobileShell title={amap.name} bottomNavigation={<FamilyBottomNavigation amapSlug={slug} />}>
      {children}
    </MobileShell>
  );
}
