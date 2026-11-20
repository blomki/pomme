import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireProducerPage } from "@/server/auth/guards";
import { getToPrepare } from "@/server/to-prepare";
import { ProducerToPrepare } from "@/ui/producer/ProducerToPrepare";

type Props = { searchParams: Promise<{ semaine?: string }> };

// /producteur/a-preparer?semaine=<distribution> : quantités à préparer pour une distribution de
// l'AMAP courante, puis la liste par foyer (story E5, écran P3).
export default async function ProducerToPreparePage({ searchParams }: Props) {
  const { semaine } = await searchParams;
  const { current, amap, contextIn } = await requireProducerPage();
  const data = await withAmapContext(getDatabase(), contextIn(current.amapId), (tx, ctx) =>
    getToPrepare(tx, ctx, { amapProducerId: current.amapProducerId, distributionId: semaine }),
  );
  return <ProducerToPrepare amapName={amap.name} data={data} />;
}
