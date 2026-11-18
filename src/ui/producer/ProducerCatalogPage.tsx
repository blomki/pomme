"use client";

import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatDate } from "@/i18n/dates";
import type { CatalogDraft } from "@/server/catalogs";

import { CatalogEditor } from "../catalog/CatalogEditor";
import { CatalogMonthHeader } from "../catalog/CatalogMonthHeader";

/**
 * Écran « Catalogue du mois » du producteur (P2), sur téléphone : mois (flèches), statut, un
 * onglet par AMAP livrée s'il en a plusieurs, puis le brouillon à modifier (une carte par
 * produit). Le choix durable de l'AMAP courante viendra avec la story C4.
 */
export function ProducerCatalogPage({
  month,
  amaps,
  current,
  draft,
}: {
  month: string;
  amaps: Array<{ amapProducerId: string; amapSlug: string; label: string }>;
  current: { amapProducerId: string; amapSlug: string };
  draft: CatalogDraft;
}) {
  const t = useTranslations("Producer.catalogue");
  const label = formatDate(`${month}-01T12:00:00Z`, "MMMM yyyy");
  const href = (m: string, amap = current.amapSlug) =>
    `/producteur/catalogue?amap=${amap}&mois=${m}`;

  return (
    <>
      <CatalogMonthHeader
        month={month}
        monthLabel={label}
        status={draft.status}
        hrefFor={(m) => href(m)}
      />

      {amaps.length > 1 && (
        // Onglets-liens : chaque AMAP a sa propre adresse (bouton Retour du téléphone).
        <Tabs
          value={current.amapProducerId}
          aria-label={t("tabs")}
          variant="scrollable"
          sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
        >
          {amaps.map((a) => (
            <Tab
              key={a.amapProducerId}
              value={a.amapProducerId}
              label={a.label}
              component={Link}
              href={href(month, a.amapSlug)}
            />
          ))}
        </Tabs>
      )}

      {/* Remonté à chaque producteur, mois ou statut : l'éditeur repart du catalogue enregistré. */}
      <CatalogEditor
        key={`${current.amapProducerId}-${draft.month}-${draft.status ?? "new"}`}
        amapSlug={current.amapSlug}
        amapProducerId={current.amapProducerId}
        draft={draft}
        monthLabel={label}
        layout="cards"
      />
    </>
  );
}
