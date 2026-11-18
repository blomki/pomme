import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { orderFormCsv } from "@/domain/order-forms";
import { formatDate } from "@/i18n/dates";
import { getAmapBySlug } from "@/server/amap";
import { ForbiddenError } from "@/server/auth/errors";
import { getCurrentSession } from "@/server/auth/session";
import { getOrderForm } from "@/server/order-forms";

type Context = { params: Promise<{ amap: string }> };

/**
 * GET /<amap>/referent/bons-de-commande/tableur?producteur=<id>&mois=2026-12 : bon de commande
 * au format tableur (story E1). Réservé au référent du producteur (ou au producteur), après la
 * clôture des commandes.
 */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const { amap: slug } = await params;
  const url = new URL(request.url);
  const amapProducerId = url.searchParams.get("producteur") ?? "";
  const month = url.searchParams.get("mois") ?? "";
  const amap = await getAmapBySlug(slug);
  const session = await getCurrentSession();
  if (!amap || !session) return new Response(null, { status: 404 });

  const ctx = {
    amapId: amap.id,
    userId: session.user.id,
    secondFactorVerified: Boolean(session.session.secondFactorVerifiedAt),
  };
  let view;
  try {
    view = await withAmapContext(getDatabase(), ctx, (tx, c) =>
      getOrderForm(tx, c, { amapProducerId, month }),
    );
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 404 });
    throw error;
  }
  if (!view) return new Response(null, { status: 404 });
  if (view.period?.status !== "closed") return new Response(null, { status: 409 });

  const t = await getTranslations("OrderForm");
  const monthLabel = formatDate(`${view.month}-01T12:00:00Z`, "MMMM yyyy");
  const csv = orderFormCsv(view.form, {
    title: t("spreadsheetTitle", {
      producer: view.producerName,
      amap: amap.name,
      month: monthLabel,
    }),
    product: t("product"),
    price: t("price"),
    total: t("total"),
    amount: t("amount"),
    household: t("household"),
    credit: t("credit"),
    expected: t("expected"),
    day: (date) => formatDate(`${date}T12:00:00Z`, "d MMM"),
  });
  const name = `bon-de-commande-${view.month}-${view.producerName}`
    .normalize("NFD")
    .replace(/[^\w-]+/g, "-")
    .toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      // Données de foyers : jamais gardées par un cache intermédiaire.
      "Cache-Control": "private, no-store",
    },
  });
}
