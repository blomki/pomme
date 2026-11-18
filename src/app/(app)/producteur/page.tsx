import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireProducerPage } from "@/server/auth/guards";
import { getProducerHomeTask } from "@/server/catalogs";
import { ProducerHome } from "@/ui/producer/ProducerHome";

// Accueil du producteur (écran P1, story C4) : AMAP courante et catalogue à publier.
export default async function ProducerHomePage() {
  const { amaps, current, amap, contextIn } = await requireProducerPage();
  const task = await withAmapContext(getDatabase(), contextIn(current.amapId), (tx, ctx) =>
    getProducerHomeTask(tx, ctx, current.amapProducerId),
  );
  // Un compte lié à plusieurs producteurs (rare) : le nom du producteur précise le choix.
  const severalProducers = new Set(amaps.map((a) => a.producerName)).size > 1;
  return (
    <ProducerHome
      amap={{ name: amap.name, logoUrl: amap.logoUrl }}
      amaps={amaps.map((a) => ({
        amapProducerId: a.amapProducerId,
        label: severalProducers ? `${a.amapName} · ${a.producerName}` : a.amapName,
      }))}
      currentId={current.amapProducerId}
      task={task}
    />
  );
}
