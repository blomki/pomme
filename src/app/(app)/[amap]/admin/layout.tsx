import type { ReactNode } from "react";

import { getAmapSummary } from "@/server/amap-summary";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { modesIn } from "@/server/spaces";
import { DesktopShell } from "@/ui/layout/DesktopShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espace administrateur : menu latéral (replié sur téléphone), bouton « Mode », carte de l'AMAP.
// Réservé aux admins de l'AMAP, après la deuxième vérification (story A1).
export default async function AdminLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const { amap, state } = await requireAmapAdminPage(slug);
  const [modes, summary] = await Promise.all([modesIn(state.user.id, slug), getAmapSummary(slug)]);
  return (
    <DesktopShell
      title={amap.name}
      area="admin"
      amapSlug={slug}
      modes={modes}
      firstName={state.user.name}
      summary={summary}
      bannerImageUrl={amap.logoUrl}
    >
      {children}
    </DesktopShell>
  );
}
