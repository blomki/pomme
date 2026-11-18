import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { MEMBERSHIP_STATUSES, type MembershipStatus } from "@/domain/memberships";
import { requireAmapAdminPage } from "@/server/auth/guards";
import { listHouseholds } from "@/server/households";
import { membershipStates } from "@/server/memberships";
import { HouseholdsTable } from "@/ui/admin/HouseholdsTable";
import { MembershipFilter } from "@/ui/admin/MembershipFilter";
import { LinkButton } from "@/ui/navigation/LinkButton";

type Props = {
  params: Promise<{ amap: string }>;
  searchParams: Promise<{ archives?: string; adhesion?: string }>;
};

// [domaine]/<amap>/admin/foyers : foyers de l'AMAP (story A2) ; ?archives=1 pour les archivés,
// ?adhesion=expiring pour filtrer les foyers actifs par statut d'adhésion (story B1).
// L'onglet « Demandes d'adhésion » arrivera avec le formulaire « Nous rejoindre » (B2).
export default async function HouseholdsPage({ params, searchParams }: Props) {
  const { amap: slug } = await params;
  const query = await searchParams;
  const archived = query.archives === "1";
  const filter = MEMBERSHIP_STATUSES.find((s) => s === query.adhesion) ?? null;
  const { ctx } = await requireAmapAdminPage(slug);
  const { all, statuses } = await withAmapContext(getDatabase(), ctx, async (tx, c) => {
    const list = await listHouseholds(tx, c, { archived });
    const states = archived
      ? new Map()
      : await membershipStates(
          tx,
          c,
          list.map((h) => h.id),
        );
    return {
      all: list,
      statuses: Object.fromEntries([...states].map(([id, state]) => [id, state.status])) as Record<
        string,
        MembershipStatus
      >,
    };
  });
  const households = filter ? all.filter((h) => statuses[h.id] === filter) : all;
  const counts = { all: all.length } as Record<MembershipStatus | "all", number>;
  for (const status of MEMBERSHIP_STATUSES) {
    counts[status] = all.filter((h) => statuses[h.id] === status).length;
  }
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
      {!archived && <MembershipFilter basePath={base} current={filter} counts={counts} />}
      <HouseholdsTable
        amapSlug={slug}
        households={households}
        archived={archived}
        membership={archived ? undefined : statuses}
        emptyMessage={filter ? t("filterEmpty") : undefined}
      />
      <LinkButton href={archived ? base : `${base}?archives=1`} sx={{ mt: 3 }}>
        {archived ? t("showActive") : t("showArchived")}
      </LinkButton>
    </>
  );
}
