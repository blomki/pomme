"use client";

import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatEuros } from "@/domain/catalog";
import { formatDate } from "@/i18n/dates";
import type { HouseholdOrderOverview } from "@/server/order-corrections";

import { OrderStatusChip } from "../family/OrderOverview";

/**
 * Section « Commande du mois » de la fiche d'un foyer (admin, story D7) : où en est sa commande
 * chez chaque producteur, et un lien pour la corriger. Rien à corriger hors période ouverte.
 */
export function HouseholdOrderSection({
  amapSlug,
  householdId,
  overview,
}: {
  amapSlug: string;
  householdId: string;
  overview: HouseholdOrderOverview;
}) {
  const t = useTranslations("Correction");
  const tf = useTranslations("Family.order");
  return (
    <Box component="section" aria-labelledby="orders-title" sx={{ mt: 5, maxWidth: 720 }}>
      <Typography id="orders-title" variant="h2" sx={{ mb: 1 }}>
        {t("householdOrders")}
      </Typography>
      {overview.state === "not_open" ? (
        <Typography>{t("notOpen")}</Typography>
      ) : (
        <>
          <Typography sx={{ mb: 1 }}>
            {t("householdOrdersOpen", {
              month: formatDate(`${overview.month}-01T12:00:00Z`, "MMMM"),
              date: formatDate(`${overview.closesOn}T12:00:00Z`, "EEEE d MMMM"),
            })}
          </Typography>
          {overview.producers.length === 0 ? (
            <Typography>{tf("noCatalog")}</Typography>
          ) : (
            <List disablePadding>
              {overview.producers.map((p) => (
                <ListItem key={p.amapProducerId} disablePadding>
                  <ListItemButton
                    component={Link}
                    href={`/${amapSlug}/admin/foyers/${householdId}/commande/${p.amapProducerId}`}
                  >
                    <ListItemText
                      primary={p.name}
                      secondary={p.totalCents > 0 ? formatEuros(p.totalCents) : tf("noAmount")}
                    />
                    <OrderStatusChip status={p.status} />
                    {/* Texte visible : le nom du lien dit ce qu'il fait (« … Corriger »). */}
                    <Typography variant="labelLarge" sx={{ ml: 2, color: "primary.main" }}>
                      {t("correct")}
                    </Typography>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}
    </Box>
  );
}
