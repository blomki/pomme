import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { requireAmap } from "../../_components/AmapThemeBoundary";

type Props = { params: Promise<{ amap: string }> };

// Page publique d'une AMAP, par exemple [domaine]/hommesdeterre (contenu : story B2 et pages A6).
export default async function AmapPublicPage({ params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  const t = await getTranslations("Amap");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {amap.name}
      </Typography>
      <Typography>{t("intro")}</Typography>
    </>
  );
}
