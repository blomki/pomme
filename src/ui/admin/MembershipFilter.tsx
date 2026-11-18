"use client";

import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { MEMBERSHIP_STATUSES, type MembershipStatus } from "@/domain/memberships";

/**
 * Filtre de la liste des foyers par statut d'adhésion (story B1). Onglets-liens : chaque
 * filtre a sa propre adresse (?adhesion=expiring), qu'on peut garder ou partager.
 */
export function MembershipFilter({
  basePath,
  current,
  counts,
}: {
  basePath: string;
  current: MembershipStatus | null;
  counts: Record<MembershipStatus | "all", number>;
}) {
  const t = useTranslations("Admin.households");
  const ts = useTranslations("Admin.memberships.status");
  return (
    <Tabs
      value={current ?? "all"}
      aria-label={t("filterLabel")}
      variant="scrollable"
      allowScrollButtonsMobile
      sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
    >
      <Tab
        value="all"
        label={`${t("filterAll")} (${counts.all})`}
        component={Link}
        href={basePath}
      />
      {MEMBERSHIP_STATUSES.map((status) => (
        <Tab
          key={status}
          value={status}
          label={`${ts(status)} (${counts[status]})`}
          component={Link}
          href={`${basePath}?adhesion=${status}`}
        />
      ))}
    </Tabs>
  );
}
