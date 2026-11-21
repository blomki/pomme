import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getFileStore } from "@/server/files/storage";
import { getPageForEdit } from "@/server/pages";
import { PageEditor } from "@/ui/admin/PageEditor";

import { siteAddress } from "../site-address";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ parent?: string }>;
};

// /<amap>/admin/pages/nouvelle?parent=<page> : nouvelle page, ou sous-page (story H2).
export default async function NewPagePage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const { parent } = await searchParams;
  const { ctx } = await requireAmapAdminPage(slug);
  const page = await withAmapContext(getDatabase(), ctx, (tx, c) =>
    getPageForEdit(tx, c, { parentId: parent }),
  );
  if (!page) notFound();
  return (
    <PageEditor
      amapSlug={slug}
      siteAddress={siteAddress(slug)}
      page={page}
      imagesEnabled={getFileStore() !== null}
    />
  );
}
