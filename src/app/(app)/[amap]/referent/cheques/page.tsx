import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { parseMonth } from "@/domain/distributions";
import { requireAmapReferentPage } from "@/server/auth/guards";
import { defaultChequeMonth, getChequePointage } from "@/server/cheques";
import { listMyProducers } from "@/server/producers";
import { ChequePointagePage } from "@/ui/referent/ChequePointagePage";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ mois?: string; producteur?: string }>;
};

// [domaine]/<amap>/referent/cheques?mois=2026-12&producteur=<id> : pointage des chèques d'un
// producteur suivi (story F1, écran R3). Par défaut : le mois de la dernière clôture, le premier
// producteur.
export default async function ChequesPage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const { mois, producteur } = await searchParams;
  const { ctx } = await requireAmapReferentPage(slug);
  const t = await getTranslations("Referent.cheques");

  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => {
    const month = parseMonth(mois ?? "") ?? (await defaultChequeMonth(tx));
    const producers = await listMyProducers(tx, c);
    const current = producers.find((p) => p.id === producteur) ?? producers[0];
    const view = current
      ? await getChequePointage(tx, c, { amapProducerId: current.id, month })
      : null;
    return { producers, view };
  });

  if (!data.view) return <Typography>{t("noProducers")}</Typography>;
  return (
    <ChequePointagePage
      // key : repart des données du serveur quand on change de mois ou de producteur.
      key={`${data.view.amapProducerId}-${data.view.month}`}
      amapSlug={slug}
      basePath={`/${slug}/referent/cheques`}
      producers={data.producers.map((p) => ({ id: p.id, name: p.name }))}
      view={data.view}
    />
  );
}
