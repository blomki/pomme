import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { addMonths, parseMonth } from "@/domain/distributions";
import { formatDate } from "@/i18n/dates";
import { requireProducerPage } from "@/server/auth/guards";
import { getCatalogDraft } from "@/server/catalogs";
import { ProducerCatalogPage } from "@/ui/producer/ProducerCatalogPage";

type Props = {
  searchParams: Promise<{ amap?: string; mois?: string }>;
};

// /producteur/catalogue?amap=hommesdeterre&mois=2026-12 : catalogue du mois du producteur dans
// une de ses AMAP (story C2, écran P2). Par défaut : le mois prochain, la première AMAP.
export default async function ProducerCataloguePage({ searchParams }: Props) {
  const { amap, mois } = await searchParams;
  const month = parseMonth(mois ?? "") ?? addMonths(formatDate(new Date(), "yyyy-MM"), 1);
  const { amaps, contextIn } = await requireProducerPage();
  const current = amaps.find((a) => a.amapSlug === amap) ?? amaps[0]!;

  // Le catalogue se lit DANS l'AMAP choisie : la Row Level Security s'applique comme pour le
  // référent, et getCatalogDraft vérifie que le compte est bien celui du producteur.
  const draft = await withAmapContext(getDatabase(), contextIn(current.amapId), (tx, ctx) =>
    getCatalogDraft(tx, ctx, { amapProducerId: current.amapProducerId, month }),
  );
  // Un compte lié à plusieurs producteurs (rare) : le nom du producteur précise l'onglet.
  const severalProducers = new Set(amaps.map((a) => a.producerName)).size > 1;

  return (
    <ProducerCatalogPage
      key={`${current.amapProducerId}-${month}`}
      month={month}
      amaps={amaps.map((a) => ({
        amapProducerId: a.amapProducerId,
        amapSlug: a.amapSlug,
        label: severalProducers ? `${a.amapName} · ${a.producerName}` : a.amapName,
      }))}
      current={current}
      draft={draft!}
    />
  );
}
