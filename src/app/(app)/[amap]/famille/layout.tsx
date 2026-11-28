import type { ReactNode } from "react";

import { requireAmap } from "../../../_components/AmapThemeBoundary";
import { getCurrentSession } from "@/server/auth/session";
import { modesIn } from "@/server/spaces";
import { FamilyBottomNavigation } from "@/ui/layout/FamilyBottomNavigation";
import { MobileShell } from "@/ui/layout/MobileShell";
import { ModeMenu } from "@/ui/layout/ModeMenu";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espace famille : gabarit mobile, barre du bas Accueil / Chèques / Profil (écran 1), et bouton
// « Mode » dans l'en-tête pour qui est aussi référent ou admin de l'AMAP (fiche #126).
export default async function FamilyLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const [amap, session] = await Promise.all([requireAmap(slug), getCurrentSession()]);
  const modes = await modesIn(session?.user.id, slug);
  return (
    <MobileShell
      title={amap.name}
      modeMenu={
        modes.length > 1 ? <ModeMenu amapSlug={slug} current="famille" modes={modes} /> : undefined
      }
      bottomNavigation={<FamilyBottomNavigation amapSlug={slug} />}
    >
      {children}
    </MobileShell>
  );
}
