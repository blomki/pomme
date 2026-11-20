import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireFamilyPage } from "@/server/auth/guards";
import { getFamilyCheques } from "@/server/family-home";
import { FamilyCheques } from "@/ui/family/FamilyCheques";

import { OrderState } from "../commande/OrderState";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/famille/cheques : chèques de la commande clôturée, à imprimer (stories D6, E2).
export default async function FamilyChequesPage({ params }: Props) {
  const { amap: slug } = await params;
  const { amap, ctx } = await requireFamilyPage(slug);
  const cheques = await withAmapContext(getDatabase(), ctx, (tx, c) => getFamilyCheques(tx, c));
  if (cheques.state === "no_household") return <OrderState state="no_household" />;
  return <FamilyCheques amapSlug={slug} amapName={amap.name} cheques={cheques} />;
}
