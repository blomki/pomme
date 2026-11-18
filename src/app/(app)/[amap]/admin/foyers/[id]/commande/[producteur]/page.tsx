import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { ForbiddenError } from "@/server/auth/errors";
import { getOrderCorrection } from "@/server/order-corrections";
import { OrderCorrectionScreen } from "@/ui/order-correction/OrderCorrectionScreen";

type Props = { params: Promise<{ amap: string; id: string; producteur: string }> };

// [domaine]/<amap>/admin/foyers/<id>/commande/<producteur> : l'admin corrige la commande d'un
// foyer, chez n'importe quel producteur de l'AMAP (story D7).
export default async function AdminOrderCorrectionPage({ params }: Props) {
  const { amap: slug, id, producteur } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const correction = await withAmapContext(getDatabase(), ctx, (tx, c) =>
    getOrderCorrection(tx, c, { householdId: id, amapProducerId: producteur }),
  ).catch((error: unknown) => {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  });
  if (correction.state === "not_found") notFound();
  return (
    <OrderCorrectionScreen
      amapSlug={slug}
      amapProducerId={producteur}
      backHref={`/${slug}/admin/foyers/${id}`}
      correction={correction}
    />
  );
}
