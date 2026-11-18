import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapReferentPage } from "@/server/auth/guards";
import { ForbiddenError } from "@/server/auth/errors";
import { getOrderCorrection } from "@/server/order-corrections";
import { OrderCorrectionScreen } from "@/ui/order-correction/OrderCorrectionScreen";

type Props = { params: Promise<{ amap: string; producteur: string; foyer: string }> };

// [domaine]/<amap>/referent/bons-de-commande/corriger/<producteur>/<foyer> : le référent
// corrige la commande d'un foyer chez un producteur qu'il suit (story D7).
export default async function ReferentOrderCorrectionPage({ params }: Props) {
  const { amap: slug, producteur, foyer } = await params;
  const { ctx } = await requireAmapReferentPage(slug);
  const correction = await withAmapContext(getDatabase(), ctx, (tx, c) =>
    getOrderCorrection(tx, c, { householdId: foyer, amapProducerId: producteur }),
  ).catch((error: unknown) => {
    // Producteur qu'il ne suit pas : la page n'existe pas pour lui.
    if (error instanceof ForbiddenError) notFound();
    throw error;
  });
  if (correction.state === "not_found") notFound();
  return (
    <OrderCorrectionScreen
      amapSlug={slug}
      amapProducerId={producteur}
      backHref={`/${slug}/referent/bons-de-commande?producteur=${producteur}`}
      correction={correction}
    />
  );
}
