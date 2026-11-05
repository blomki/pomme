import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getAmapBySlug } from "@/server/amap";
import { AppThemeProvider } from "@/ui/theme/AppThemeProvider";
import { resolveThemeConfig } from "@/ui/theme/key-colors";

/**
 * Applique le thème de l'AMAP de l'adresse (couleurs, police des titres).
 * Adresse inconnue, réservée ou AMAP archivée : page 404.
 */
export async function AmapThemeBoundary({ slug, children }: { slug: string; children: ReactNode }) {
  const amap = await getAmapBySlug(slug);
  if (!amap) notFound();
  return <AppThemeProvider config={resolveThemeConfig(amap.theme)}>{children}</AppThemeProvider>;
}

/** L'AMAP de l'adresse ; à n'appeler que sous AmapThemeBoundary (qui a déjà vérifié qu'elle existe). */
export async function requireAmap(slug: string) {
  const amap = await getAmapBySlug(slug);
  if (!amap) notFound();
  return amap;
}
