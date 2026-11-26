import type { ReactNode } from "react";

import { requireAmap } from "../../../_components/AmapThemeBoundary";
import { getAmapSummary } from "@/server/amap-summary";
import { getCurrentSession } from "@/server/auth/session";
import { modesIn } from "@/server/spaces";
import { DesktopShell } from "@/ui/layout/DesktopShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espace référent : menu latéral (replié sur téléphone), bouton « Mode », carte de l'AMAP. Les
// pages vérifient le rôle puis la deuxième vérification (ADR 0041).
export default async function ReferentLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  const session = await getCurrentSession();
  const [modes, summary] = await Promise.all([
    modesIn(session?.user.id, slug),
    getAmapSummary(slug),
  ]);
  return (
    <DesktopShell
      title={amap.name}
      area="referent"
      amapSlug={slug}
      modes={modes}
      firstName={session?.user.name}
      summary={summary}
      bannerImageUrl={amap.logoUrl}
    >
      {children}
    </DesktopShell>
  );
}
