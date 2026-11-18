import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { addMonths, parseMonth } from "@/domain/distributions";
import { formatDate } from "@/i18n/dates";
import { requireProducerPage } from "@/server/auth/guards";
import { getCatalogDraft } from "@/server/catalogs";
import { ProducerCatalogPage } from "@/ui/producer/ProducerCatalogPage";

type Props = {
  searchParams: Promise<{ mois?: string }>;
};

// /producteur/catalogue?mois=2026-12 : catalogue du mois du producteur dans son AMAP courante
// (stories C2 et C4, écran P2). Par défaut : le mois prochain. L'AMAP se change sur l'accueil.
export default async function ProducerCataloguePage({ searchParams }: Props) {
  const { mois } = await searchParams;
  const month = parseMonth(mois ?? "") ?? addMonths(formatDate(new Date(), "yyyy-MM"), 1);
  const { amaps, current, contextIn } = await requireProducerPage();

  // Le catalogue se lit DANS l'AMAP courante : la Row Level Security s'applique comme pour le
  // référent, et getCatalogDraft vérifie que le compte est bien celui du producteur.
  const draft = await withAmapContext(getDatabase(), contextIn(current.amapId), (tx, ctx) =>
    getCatalogDraft(tx, ctx, { amapProducerId: current.amapProducerId, month }),
  );

  return (
    <ProducerCatalogPage
      key={`${current.amapProducerId}-${month}`}
      month={month}
      // Plusieurs AMAP : on rappelle pour laquelle on prépare le catalogue.
      amapName={amaps.length > 1 ? current.amapName : null}
      current={current}
      draft={draft!}
    />
  );
}
