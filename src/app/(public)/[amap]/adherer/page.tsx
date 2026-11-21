import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { captchaWidgetConfig } from "@/server/captcha";
import { JoinForm } from "@/ui/pages/JoinForm";

import { requireAmap } from "../../../_components/AmapThemeBoundary";

type Props = { params: Promise<{ amap: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const amap = await requireAmap((await params).amap);
  const t = await getTranslations("JoinForm");
  return { title: `${t("title")} · ${amap.name}`, description: t("intro", { amap: amap.name }) };
}

// [domaine]/<amap>/adherer : demander à adhérer (story B2). Rendu côté serveur ; l'envoi passe
// par le captcha et les limites de débit.
export default async function JoinPage({ params }: Props) {
  const { amap: slug } = await params;
  const amap = await requireAmap(slug);
  const t = await getTranslations("JoinForm");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 3 }}>{t("intro", { amap: amap.name })}</Typography>
      <JoinForm amapSlug={amap.slug} captcha={captchaWidgetConfig()} />
    </>
  );
}
