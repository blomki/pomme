"use client";

import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import { formatDate } from "@/i18n/dates";
import type { CatalogDraft } from "@/server/catalogs";

import { CatalogEditor } from "../catalog/CatalogEditor";
import { CatalogMonthHeader } from "../catalog/CatalogMonthHeader";

/**
 * Écran « Catalogue du mois » du producteur (P2), sur téléphone : mois (flèches), statut, puis
 * le brouillon à modifier (une carte par produit), dans l'AMAP courante (choisie sur l'accueil,
 * story C4). `amapName` : rappelé sous le titre quand le producteur livre plusieurs AMAP.
 */
export function ProducerCatalogPage({
  month,
  amapName,
  current,
  draft,
}: {
  month: string;
  amapName: string | null;
  current: { amapProducerId: string; amapSlug: string };
  draft: CatalogDraft;
}) {
  const t = useTranslations("Producer.catalogue");
  const label = formatDate(`${month}-01T12:00:00Z`, "MMMM yyyy");
  const href = (m: string) => `/producteur/catalogue?mois=${m}`;

  return (
    <>
      <CatalogMonthHeader
        month={month}
        monthLabel={label}
        status={draft.status}
        hrefFor={(m) => href(m)}
      />

      {amapName && (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t("amap", { name: amapName })}
        </Typography>
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
