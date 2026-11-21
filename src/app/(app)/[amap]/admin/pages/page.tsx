import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { listPagesForAdmin } from "@/server/pages";
import { PagesList } from "@/ui/admin/PagesList";

import { siteAddress } from "./site-address";

type Props = { params: Promise<{ amap: string }> };

// /<amap>/admin/pages : pages du site public et menu (story H2, écran A6).
export default async function AdminPagesPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const data = await withAmapContext(getDatabase(), ctx, (tx, c) => listPagesForAdmin(tx, c));
  return <PagesList amapSlug={slug} siteAddress={siteAddress(slug)} data={data} />;
}
