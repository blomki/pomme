import Typography from "@mui/material/Typography";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireAmap } from "@/app/_components/AmapThemeBoundary";
import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { parseMonth } from "@/domain/distributions";
import { ForbiddenError } from "@/server/auth/errors";
import { getCurrentSession } from "@/server/auth/session";
import { linkExpiry, verifyOrderFormLink } from "@/server/order-form-link";
import { getOrderForm, loadOrderForm } from "@/server/order-forms";
import { PrintableOrderForm } from "@/ui/order-form/PrintableOrderForm";

type Props = {
  params: Promise<{ amap: string; producteur: string; mois: string }>;
  searchParams: Promise<{ cle?: string }>;
};

// [domaine]/<amap>/bon-de-commande/<producteur>/<mois>[?cle=…] : bon de commande prêt à
// imprimer, sans menu (story E1, ADR 0019). Deux accès :
// - le lien signé envoyé au producteur par email (?cle=), valable sans connexion ;
// - une session du référent de ce producteur, ou du producteur lui-même.
export default async function PrintableOrderFormPage({ params, searchParams }: Props) {
  const { amap: slug, producteur, mois } = await params;
  const { cle } = await searchParams;
  const amap = await requireAmap(slug);
  const month = parseMonth(mois);
  if (!month) notFound();
  const t = await getTranslations("OrderForm");

  if (cle) {
    if (!verifyOrderFormLink(cle, { amapProducerId: producteur, month })) {
      return (
        <Typography component="h1" variant="titleLarge" sx={{ p: 4 }}>
          {t("linkExpired")}
        </Typography>
      );
    }
    // Lien valable : lecture dans l'AMAP, sans compte (la Row Level Security limite à l'AMAP).
    const view = await withAmapContext(getDatabase(), { amapId: amap.id, userId: null }, (tx) =>
      loadOrderForm(tx, producteur, month),
    );
    if (!view) notFound();
    return <PrintableOrderForm amapName={amap.name} view={view} validUntil={linkExpiry(cle)} />;
  }

  const session = await getCurrentSession();
  if (!session) redirect("/connexion");
  const ctx = {
    amapId: amap.id,
    userId: session.user.id,
    secondFactorVerified: Boolean(session.session.secondFactorVerifiedAt),
  };
  let view;
  try {
    view = await withAmapContext(getDatabase(), ctx, (tx, c) =>
      getOrderForm(tx, c, { amapProducerId: producteur, month }),
    );
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!view) notFound();
  return <PrintableOrderForm amapName={amap.name} view={view} validUntil={null} />;
}
