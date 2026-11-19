import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireFamilyPage } from "@/server/auth/guards";
import { getFamilyReports } from "@/server/reports";
import { FamilyReports } from "@/ui/family/FamilyReports";

import { OrderState } from "../commande/OrderState";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/famille/signalement : signaler un produit manquant ou abîmé (story F5, écran 6).
export default async function FamilyReportPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireFamilyPage(slug);
  const data = await withAmapContext(getDatabase(), ctx, (tx, c) => getFamilyReports(tx, c));
  if (data.state === "no_household") return <OrderState state="no_household" />;
  return <FamilyReports amapSlug={slug} lines={data.lines} reports={data.reports} />;
}
