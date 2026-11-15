import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { listAmapProducers } from "@/server/producers";
import { ProducersTable } from "@/ui/admin/ProducersTable";
import { LinkButton } from "@/ui/navigation/LinkButton";

type Props = { params: Promise<{ amap: string }> };

// [domaine]/<amap>/admin/producteurs : producteurs et référents (story C1, écran A4).
export default async function ProducersPage({ params }: Props) {
  const { amap: slug } = await params;
  const { ctx } = await requireAmapAdminPage(slug);
  const producers = await withAmapContext(getDatabase(), ctx, (tx, c) => listAmapProducers(tx, c));
  const t = await getTranslations("Admin.producers");
  return (
    <>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 3, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
      >
        <Typography variant="h1">{t("title")}</Typography>
        <LinkButton href={`/${slug}/admin/producteurs/nouveau`} variant="contained">
          {t("add")}
        </LinkButton>
      </Stack>
      <ProducersTable amapSlug={slug} producers={producers} />
      <Typography variant="bodySmall" component="p" sx={{ mt: 2, color: "text.secondary" }}>
        {t("note")}
      </Typography>
    </>
  );
}
