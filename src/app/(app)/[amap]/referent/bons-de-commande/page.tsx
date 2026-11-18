import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { parseMonth } from "@/domain/distributions";
import { requireAmapReferentPage } from "@/server/auth/guards";
import { defaultOrderFormMonth, getOrderForm } from "@/server/order-forms";
import { listMyProducers } from "@/server/producers";
import { OrderFormPage } from "@/ui/referent/OrderFormPage";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ mois?: string; producteur?: string }>;
};

// [domaine]/<amap>/referent/bons-de-commande?mois=2026-12&producteur=<id> : bon de commande
// d'un producteur suivi (story E1, écran R2). Par défaut : le mois en cours de commande, le
// premier producteur. Le référent ne voit que ses producteurs.
export default async function OrderFormsPage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const { mois, producteur } = await searchParams;
  const { ctx } = await requireAmapReferentPage(slug);
  const t = await getTranslations("Referent.orderForms");

  const data = await withAmapContext(getDatabase(), ctx, async (tx, c) => {
    const month = parseMonth(mois ?? "") ?? (await defaultOrderFormMonth(tx));
    const producers = await listMyProducers(tx, c);
    const current = producers.find((p) => p.id === producteur) ?? producers[0];
    const view = current ? await getOrderForm(tx, c, { amapProducerId: current.id, month }) : null;
    return { month, producers, view };
  });

  if (!data.view) return <Typography>{t("noProducers")}</Typography>;
  return (
    <OrderFormPage
      amapSlug={slug}
      month={data.month}
      producers={data.producers.map((p) => ({ id: p.id, name: p.name }))}
      view={data.view}
    />
  );
}
