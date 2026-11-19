import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { parseMonth } from "@/domain/distributions";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { defaultChequeMonth, getChequePointage } from "@/server/cheques";
import { listAmapProducers } from "@/server/producers";
import { ChequePointagePage } from "@/ui/referent/ChequePointagePage";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ mois?: string; producteur?: string }>;
};

// [domaine]/<amap>/admin/cheques?mois=2026-12&producteur=<id> : pointage des chèques depuis
// l'espace admin (story F1), chez tous les producteurs actifs de l'AMAP. Même écran que celui du
// référent ; l'admin a fait sa deuxième vérification pour entrer dans son espace.
export default async function AdminChequesPage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const { mois, producteur } = await searchParams;
  const { ctx } = await requireAmapAdminPage(slug);
  const t = await getTranslations("Referent.cheques");

  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => {
    const month = parseMonth(mois ?? "") ?? (await defaultChequeMonth(tx));
    const producers = (await listAmapProducers(tx, c)).filter((p) => p.active);
    const current = producers.find((p) => p.id === producteur) ?? producers[0];
    const view = current
      ? await getChequePointage(tx, c, { amapProducerId: current.id, month })
      : null;
    return { producers, view };
  });

  if (!data.view) return <Typography>{t("noProducersAdmin")}</Typography>;
  return (
    <ChequePointagePage
      key={`${data.view.amapProducerId}-${data.view.month}`}
      amapSlug={slug}
      basePath={`/${slug}/admin/cheques`}
      producers={data.producers.map((p) => ({ id: p.id, name: p.name }))}
      view={data.view}
    />
  );
}
