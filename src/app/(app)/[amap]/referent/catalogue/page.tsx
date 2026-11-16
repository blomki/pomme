import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { addMonths, parseMonth } from "@/domain/distributions";
import { formatDate } from "@/i18n/dates";
import { requireAmapReferentPage } from "@/server/auth/guards";
import { getCatalogDraft } from "@/server/catalogs";
import { listMyProducers } from "@/server/producers";
import { CatalogPage } from "@/ui/referent/CatalogPage";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ mois?: string; producteur?: string }>;
};

// [domaine]/<amap>/referent/catalogue?mois=2026-12&producteur=<id> : catalogue du mois d'un
// producteur suivi (story C2, écran R6). Par défaut : le mois prochain, le premier producteur.
export default async function CataloguePage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const { mois, producteur } = await searchParams;
  const month = parseMonth(mois ?? "") ?? addMonths(formatDate(new Date(), "yyyy-MM"), 1);
  const { ctx } = await requireAmapReferentPage(slug);
  const t = await getTranslations("Referent.catalogue");

  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => {
    const producers = await listMyProducers(tx, c);
    const current = producers.find((p) => p.id === producteur) ?? producers[0];
    const draft = current
      ? await getCatalogDraft(tx, c, { amapProducerId: current.id, month })
      : null;
    return { producers, current, draft };
  });

  if (!data.current || !data.draft) {
    return <Typography>{t("noProducers")}</Typography>;
  }
  return (
    <CatalogPage
      key={`${data.current.id}-${month}`}
      amapSlug={slug}
      month={month}
      producers={data.producers.map((p) => ({ id: p.id, name: p.name }))}
      currentId={data.current.id}
      draft={data.draft}
    />
  );
}
