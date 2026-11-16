"use client";

import ArrowBack from "@mui/icons-material/ArrowBack";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatDate } from "@/i18n/dates";
import type { CatalogDraft } from "@/server/catalogs";

import { CatalogEditor } from "../catalog/CatalogEditor";
import { CatalogMonthHeader } from "../catalog/CatalogMonthHeader";

/**
 * Écran « Catalogue du mois » du référent (R6) : retour à « Mes producteurs », mois (flèches),
 * statut du catalogue, un onglet par producteur suivi, puis le brouillon à modifier (tableau).
 */
export function CatalogPage({
  amapSlug,
  month,
  producers,
  currentId,
  draft,
}: {
  amapSlug: string;
  month: string;
  producers: Array<{ id: string; name: string }>;
  currentId: string;
  draft: CatalogDraft;
}) {
  const t = useTranslations("Referent.catalogue");
  const base = `/${amapSlug}/referent/catalogue`;
  const label = formatDate(`${month}-01T12:00:00Z`, "MMMM yyyy");
  const href = (m: string, producer = currentId) => `${base}?mois=${m}&producteur=${producer}`;

  return (
    <>
      <Button
        component={Link}
        href={`/${amapSlug}/referent/producteurs`}
        nativeButton={false}
        startIcon={<ArrowBack />}
        sx={{ mb: 1 }}
      >
        {t("back")}
      </Button>
      <CatalogMonthHeader
        month={month}
        monthLabel={label}
        status={draft.status}
        hrefFor={(m) => href(m)}
      />

      {/* Onglets-liens : chaque producteur a sa propre adresse (partageable, bouton Retour). */}
      <Tabs
        value={currentId}
        aria-label={t("tabs")}
        variant="scrollable"
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {producers.map((p) => (
          <Tab key={p.id} value={p.id} label={p.name} component={Link} href={href(month, p.id)} />
        ))}
      </Tabs>

      <CatalogEditor
        amapSlug={amapSlug}
        amapProducerId={currentId}
        draft={draft}
        monthLabel={label}
        layout="table"
      />
    </>
  );
}
