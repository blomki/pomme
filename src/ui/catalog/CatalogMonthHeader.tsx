"use client";

import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { addMonths } from "@/domain/distributions";
import type { CatalogDraft } from "@/server/catalogs";
import { PageBanner } from "@/ui/layout/PageBanner";

import { CatalogStatusChip } from "./CatalogEditor";

/**
 * En-tête commun des écrans « Catalogue du mois » (référent R6, producteur P2) : titre avec le
 * mois, statut du catalogue, flèches vers le mois précédent et le suivant, phrase d'explication.
 * `hrefFor` donne l'adresse de la même page pour un autre mois.
 */
export function CatalogMonthHeader({
  month,
  monthLabel,
  status,
  hrefFor,
  banner = false,
}: {
  month: string;
  monthLabel: string;
  status: CatalogDraft["status"];
  hrefFor: (month: string) => string;
  /** Titre en bandeau (espace référent, charte S14) ; sinon titre simple (espace producteur). */
  banner?: boolean;
}) {
  const t = useTranslations("Catalog");
  const tb = useTranslations("Banners");
  return (
    <>
      {banner && (
        <PageBanner title={t("title", { month: monthLabel })}>{tb("catalogue")}</PageBanner>
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
        {!banner && (
          <Typography variant="h1" sx={{ flexGrow: 1 }}>
            {t("title", { month: monthLabel })}
          </Typography>
        )}
        <CatalogStatusChip status={status} />
        <IconButton
          component={Link}
          nativeButton={false}
          href={hrefFor(addMonths(month, -1))}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          component={Link}
          nativeButton={false}
          href={hrefFor(addMonths(month, 1))}
          aria-label={t("nextMonth")}
        >
          <ChevronRight />
        </IconButton>
      </Stack>
      <Typography sx={{ color: "text.secondary", mb: 2 }}>{t("intro")}</Typography>
    </>
  );
}
