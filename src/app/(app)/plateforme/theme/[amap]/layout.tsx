import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { AmapThemeBoundary } from "../../../../_components/AmapThemeBoundary";
import { demoPagesEnabled } from "../../../../_components/demo-pages";

type Props = { children: ReactNode; params: Promise<{ amap: string }> };

// Démonstration du thème d'une AMAP (développement seulement).
export default async function ThemeDemoLayout({ children, params }: Props) {
  await connection(); // lue à chaque requête, jamais figée au build
  if (!demoPagesEnabled()) notFound();
  const { amap: slug } = await params;
  return <AmapThemeBoundary slug={slug}>{children}</AmapThemeBoundary>;
}
