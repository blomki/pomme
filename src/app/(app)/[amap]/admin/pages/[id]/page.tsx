import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { getFileStore } from "@/server/files/storage";
import { getPageForEdit } from "@/server/pages";
import { PageEditor } from "@/ui/admin/PageEditor";

import { siteAddress } from "../site-address";

type Props = { params: Promise<{ amap: string; id: string }> };

// /<amap>/admin/pages/<page> : modifier une page du site (story H2, écran A7).
export default async function EditPagePage({ params }: Props) {
  const { amap: slug, id } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const page = await withAmapContext(getDatabase(), ctx, (tx, c) =>
    getPageForEdit(tx, c, { pageId: id }),
  );
  if (!page) notFound();
  return (
    <PageEditor
      // key : repart des valeurs enregistrées quand on change de page.
      key={page.id}
      amapSlug={slug}
      siteAddress={siteAddress(slug)}
      page={page}
      imagesEnabled={getFileStore() !== null}
    />
  );
}
