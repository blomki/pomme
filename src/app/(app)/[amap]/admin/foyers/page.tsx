import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { listHouseholds } from "@/server/households";
import { HouseholdsTable } from "@/ui/admin/HouseholdsTable";
import { LinkButton } from "@/ui/navigation/LinkButton";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ archives?: string }>;
};

// [domaine]/<amap>/admin/foyers : foyers de l'AMAP (story A2) ; ?archives=1 pour les archivés.
// L'onglet « Demandes d'adhésion » arrivera avec le formulaire « Nous rejoindre » (B2).
export default async function HouseholdsPage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const archived = (await searchParams).archives === "1";
  const { ctx } = await requireAmapAdminPage(slug);
  const households = await withAmapContext(getDatabase(), ctx, (tx, c) =>
    listHouseholds(tx, c, { archived }),
  );
  const t = await getTranslations("Admin.households");
  const base = `/${slug}/admin/foyers`;
  return (
    <>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
      >
        <Typography variant="h1">{archived ? t("archivedTitle") : t("title")}</Typography>
        {!archived && (
          <LinkButton href={`${base}/nouveau`} variant="contained">
            {t("invite")}
          </LinkButton>
        )}
      </Stack>
      {!archived && <Typography sx={{ mb: 2 }}>{t("intro")}</Typography>}
      <Typography variant="titleMedium" component="p" sx={{ mb: 2 }}>
        {archived
          ? t("archivedCount", { count: households.length })
          : t("count", { count: households.length })}
      </Typography>
      <HouseholdsTable amapSlug={slug} households={households} archived={archived} />
      <LinkButton href={archived ? base : `${base}?archives=1`} sx={{ mt: 3 }}>
        {archived ? t("showActive") : t("showArchived")}
      </LinkButton>
    </>
  );
}
