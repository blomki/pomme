"use client";

import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * Onglets de l'écran « Foyers et adhésions » (écran A2) : les foyers, et les demandes
 * d'adhésion (story B2) avec le nombre à traiter. Onglets-liens : chacun a son adresse.
 */
export function HouseholdTabs({
  amapSlug,
  current,
  openRequests,
}: {
  amapSlug: string;
  current: "households" | "requests";
  openRequests: number;
}) {
  const t = useTranslations("Admin.joinRequests.tabs");
  const base = `/${amapSlug}/admin/foyers`;
  return (
    <Tabs
      value={current}
      aria-label={t("label")}
      sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
    >
      <Tab value="households" label={t("households")} component={Link} href={base} />
      <Tab
        value="requests"
        label={openRequests > 0 ? `${t("requests")} (${openRequests})` : t("requests")}
        component={Link}
        href={`${base}?onglet=demandes`}
      />
    </Tabs>
  );
}
