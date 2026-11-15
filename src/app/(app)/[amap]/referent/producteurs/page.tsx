import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapReferentPage } from "@/server/auth/guards";
import { listMyProducers } from "@/server/producers";
import { MyProducers } from "@/ui/referent/MyProducers";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/referent/producteurs : « Mes producteurs » (story C1, écran R5).
export default async function MyProducersPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapReferentPage(slug);
  const producers = await withAmapContext(getDatabase(), ctx, (tx, c) => listMyProducers(tx, c));
  const t = await getTranslations("Referent.producers");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      {producers.length === 0 ? (
        <Typography>{t("empty")}</Typography>
      ) : (
        <MyProducers amapSlug={slug} producers={producers} />
      )}
    </>
  );
}
