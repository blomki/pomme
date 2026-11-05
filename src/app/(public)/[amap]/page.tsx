import { getTranslations } from "next-intl/server";

type Props = { params: Promise<{ amap: string }> };

// Page publique d'une AMAP, par exemple [domaine]/hommesdeterre.
// « amap » est l'adresse courte (slug) de l'AMAP ; la recherche en base viendra avec la fiche S3.
export default async function AmapPublicPage({ params }: Props) {
  const { amap } = await params;
  const t = await getTranslations("Amap");
  return (
    <>
      <h1>{t("title", { amap })}</h1>
      <p>{t("intro")}</p>
    </>
  );
}
