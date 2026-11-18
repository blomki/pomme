import { OrderSummary } from "@/ui/family/OrderSummary";

import { loadFamilyOrder } from "../load";
import { OrderState } from "../OrderState";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/famille/commande/recapitulatif : chèques à préparer, validation (D3, écran 3).
export default async function FamilyOrderSummaryPage({ params }: Props) {
  const { amap: slug } = await params;
  const current = await loadFamilyOrder(slug);
  if (current.state !== "open") return <OrderState state={current.state} />;
  return (
    <OrderSummary
      amapSlug={slug}
      month={current.month}
      closesOn={current.closesOn}
      producers={current.producers}
    />
  );
}
