import type { ReactNode } from "react";

import { requireAmapAdminPage } from "@/server/auth/guards";
import { DesktopShell } from "@/ui/layout/DesktopShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espace administrateur : gabarit ordinateur, menu latéral. Réservé aux admins de l'AMAP,
// après la deuxième vérification (story A1).
export default async function AdminLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const { amap } = await requireAmapAdminPage(slug);
  return (
    <DesktopShell title={amap.name} area="admin" amapSlug={slug}>
      {children}
    </DesktopShell>
  );
}
