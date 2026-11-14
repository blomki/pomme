import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getHousehold } from "@/server/households";
import { HouseholdDetail } from "@/ui/admin/HouseholdDetail";

type Props = { params: Promise<{ amap: string; id: string }> };

// [domaine]/<amap>/admin/foyers/<id> : fiche d'un foyer (membres, rôles, archivage).
export default async function HouseholdPage({ params }: Props) {
  const { amap: slug, id } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const found = await withAmapContext(getDatabase(), ctx, (tx, c) => getHousehold(tx, c, id));
  if (!found) notFound();
  return <HouseholdDetail amapSlug={slug} household={found} />;
}
