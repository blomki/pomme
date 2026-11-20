import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireProducerPage } from "@/server/auth/guards";
import { getProducerPayments } from "@/server/producer-payments";
import { ProducerPayments } from "@/ui/producer/ProducerPayments";

type Props = { searchParams: Promise<{ mois?: string }> };

// /producteur/paiements?mois=AAAA-MM : chèques pointés par le référent, pour l'AMAP courante,
// avoirs déduits compris (story F4, écran P4). Lecture seule.
export default async function ProducerPaymentsPage({ searchParams }: Props) {
  const { mois } = await searchParams;
  const { current, amap, contextIn } = await requireProducerPage();
  const data = await withAmapContext(getDatabase(), contextIn(current.amapId), (tx, ctx) =>
    getProducerPayments(tx, ctx, { amapProducerId: current.amapProducerId, month: mois }),
  );
  return <ProducerPayments amapName={amap.name} data={data} />;
}
