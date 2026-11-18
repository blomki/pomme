import { OrderOverview } from "@/ui/family/OrderOverview";

import { loadFamilyOrder } from "./load";
import { OrderState } from "./OrderState";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/famille/commande : commande du mois, producteur par producteur (D3, écran 2).
export default async function FamilyOrderPage({ params }: Props) {
  const { amap: slug } = await params;
  const current = await loadFamilyOrder(slug);
  if (current.state !== "open") return <OrderState state={current.state} />;
  return (
    <OrderOverview
      amapSlug={slug}
      month={current.month}
      closesOn={current.closesOn}
      membershipActive={current.membershipActive}
      producers={current.producers}
    />
  );
}
