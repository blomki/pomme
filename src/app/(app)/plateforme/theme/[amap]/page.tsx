import { listAmaps } from "@/server/amap";
import { ThemeDemo } from "@/ui/theme/ThemeDemo";
import { resolveThemeConfig } from "@/ui/theme/key-colors";

import { requireAmap } from "../../../../_components/AmapThemeBoundary";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/plateforme/theme/<amap> : couleurs, typographie et composants d'une AMAP.
export default async function ThemeDemoPage({ params }: Props) {
  const { amap: slug } = await params;
  const [amap, amaps] = await Promise.all([requireAmap(slug), listAmaps()]);
  return (
    <ThemeDemo
      amapName={amap.name}
      config={resolveThemeConfig(amap.theme)}
      otherAmaps={amaps.map(({ slug: s, name }) => ({ slug: s, name, current: s === slug }))}
    />
  );
}
