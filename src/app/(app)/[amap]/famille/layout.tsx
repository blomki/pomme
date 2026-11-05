import type { ReactNode } from "react";

import { requireAmap } from "../../../_components/AmapThemeBoundary";
import { MobileShell } from "@/ui/layout/MobileShell";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Espace famille : gabarit mobile.
export default async function FamilyLayout({ children, params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  return <MobileShell title={amap.name}>{children}</MobileShell>;
}
