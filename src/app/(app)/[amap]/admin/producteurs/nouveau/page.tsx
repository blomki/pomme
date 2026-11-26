import { getTranslations } from "next-intl/server";

import { requireAmapAdminPage } from "@/server/auth/guards";
import { AddProducerForm } from "@/ui/admin/AddProducerForm";
import { PageBanner } from "@/ui/layout/PageBanner";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/producteurs/nouveau : rattacher un producteur existant ou en créer un.
export default async function AddProducerPage({ params }: Props) {
  const { amap: slug } = await params;
  await requireAmapAdminPage(slug);
  const t = await getTranslations("Admin.addProducer");
  const tb = await getTranslations("Banners");
  return (
    <>
      <PageBanner title={t("title")}>{tb("adminAddProducer")}</PageBanner>
      <AddProducerForm amapSlug={slug} />
    </>
  );
}
