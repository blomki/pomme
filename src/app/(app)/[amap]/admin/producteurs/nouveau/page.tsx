import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { requireAmapAdminPage } from "@/server/auth/guards";
import { AddProducerForm } from "@/ui/admin/AddProducerForm";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/producteurs/nouveau : rattacher un producteur existant ou en créer un.
export default async function AddProducerPage({ params }: Props) {
  const { amap: slug } = await params;
  await requireAmapAdminPage(slug);
  const t = await getTranslations("Admin.addProducer");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <AddProducerForm amapSlug={slug} />
    </>
  );
}
