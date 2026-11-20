"use client";

import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatDate } from "@/i18n/dates";
import type { ToPrepare } from "@/server/to-prepare";

import { m3 } from "../theme/create-theme";

const quantityStyle = { fontVariantNumeric: "tabular-nums", fontWeight: 700 } as const;

/**
 * « À préparer » (story E5, écran P3) : la semaine en haut (un onglet par distribution), les
 * totaux à préparer, puis un panier par foyer pour étiqueter. Seulement les mois clôturés :
 * avant, les familles peuvent encore modifier leur commande.
 */
export function ProducerToPrepare({ amapName, data }: { amapName: string; data: ToPrepare }) {
  const t = useTranslations("Producer.toPrepare");
  const day = (date: string, pattern = "EEE d MMM") => formatDate(`${date}T12:00:00Z`, pattern);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">{t("title")}</Typography>
        <Typography color="text.secondary">{amapName}</Typography>
      </Box>

      {data.weeks.length === 0 || !data.chosen ? (
        <Typography>
          {data.nextClosesOn
            ? t("notYet", { date: day(data.nextClosesOn, "EEEE d MMMM") })
            : t("nothing")}
        </Typography>
      ) : (
        <>
          {/* Onglets-liens : chaque semaine a sa propre adresse (bouton Retour, partage). */}
          <Tabs
            value={data.chosen.id}
            aria-label={t("weeks")}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            {data.weeks.map((w) => (
              <Tab
                key={w.id}
                value={w.id}
                label={day(w.date)}
                component={Link}
                href={`/producteur/a-preparer?semaine=${w.id}`}
              />
            ))}
          </Tabs>

          <Typography variant="titleLarge" component="p">
            {t("distributionOf", { date: day(data.chosen.date, "EEEE d MMMM") })}
          </Typography>

          {data.prepare.products.length === 0 ? (
            <Typography>{t("emptyWeek")}</Typography>
          ) : (
            <>
              <Paper
                component="section"
                aria-labelledby="totaux"
                elevation={0}
                sx={{ p: 2, bgcolor: m3("surfaceContainer") }}
              >
                <Typography id="totaux" variant="titleMedium" component="h2" sx={{ mb: 1 }}>
                  {t("totals")}
                </Typography>
                <List dense disablePadding>
                  {data.prepare.products.map((p) => (
                    <ListItem key={p.name} disableGutters divider>
                      <ListItemText primary={p.name} />
                      <Typography sx={quantityStyle}>× {p.quantity}</Typography>
                    </ListItem>
                  ))}
                </List>
              </Paper>

              <Box component="section" aria-labelledby="paniers">
                <Typography id="paniers" variant="titleMedium" component="h2">
                  {t("baskets", { count: data.prepare.households.length })}
                </Typography>
                <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 1.5 }}>
                  {t("basketsHint")}
                </Typography>
                <Stack spacing={1.5}>
                  {data.prepare.households.map((h) => (
                    <Paper
                      key={h.name}
                      variant="outlined"
                      component="section"
                      aria-label={h.name}
                      sx={{ p: 1.5 }}
                    >
                      <Typography variant="titleSmall" component="h3">
                        {h.name}
                      </Typography>
                      <Stack component="ul" sx={{ m: 0, pl: 2.5 }}>
                        {h.items.map((i) => (
                          <li key={i.name}>
                            {t("item", { product: i.name, quantity: i.quantity })}
                          </li>
                        ))}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
