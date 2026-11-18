import { notFound } from "next/navigation";

import { ProducerOrder } from "@/ui/family/ProducerOrder";

import { loadFamilyOrder } from "../load";
import { OrderState } from "../OrderState";

type Props = { params: Promise<{ amap: string; producteur: string }> };

// [domaine]/<amap>/famille/commande/<producteur> : quantités chez un producteur (D3, écran 2).
export default async function FamilyProducerOrderPage({ params }: Props) {
  const { amap: slug, producteur } = await params;
  const current = await loadFamilyOrder(slug);
  if (current.state !== "open") return <OrderState state={current.state} />;
  const producer = current.producers.find((p) => p.amapProducerId === producteur);
  if (!producer) notFound();
  return (
    <ProducerOrder
      key={producer.amapProducerId}
      amapSlug={slug}
      month={current.month}
      distributions={current.distributions}
      producer={producer}
    />
  );
}
