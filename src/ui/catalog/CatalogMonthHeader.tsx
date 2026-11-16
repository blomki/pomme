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
}: {
  month: string;
  monthLabel: string;
  status: CatalogDraft["status"];
  hrefFor: (month: string) => string;
}) {
  const t = useTranslations("Catalog");
  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
        <Typography variant="h1" sx={{ flexGrow: 1 }}>
          {t("title", { month: monthLabel })}
        </Typography>
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
