"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { ColorModeToggle } from "./ColorModeToggle";
import { CONTRAST_PAIRS, contrastRatio } from "./contrast";
import type { ThemeConfig } from "./key-colors";
import { createM3Schemes, M3_ROLES, type M3Scheme } from "./m3-colors";
import type { M3TypographyVariant } from "./typography";

const TYPOGRAPHY_VARIANTS: M3TypographyVariant[] = [
  "displayLarge",
  "displayMedium",
  "displaySmall",
  "headlineLarge",
  "headlineMedium",
  "headlineSmall",
  "titleLarge",
  "titleMedium",
  "titleSmall",
  "bodyLarge",
  "bodyMedium",
  "bodySmall",
  "labelLarge",
  "labelMedium",
  "labelSmall",
];

/** Texte noir ou blanc, selon ce qui se lit le mieux sur le fond. */
function readableOn(background: string): string {
  return contrastRatio(background, "#000000") >= contrastRatio(background, "#ffffff")
    ? "#000000"
    : "#ffffff";
}

const formatRatio = (ratio: number) => ratio.toFixed(1).replace(".", ",");

function Swatches({ scheme }: { scheme: M3Scheme }) {
  return (
    <Box
      component="ul"
      sx={{
        listStyle: "none",
        p: 0,
        m: 0,
        display: "grid",
        gap: 1,
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      }}
    >
      {M3_ROLES.map((role) => (
        <Box
          component="li"
          key={role}
          sx={{
            backgroundColor: scheme[role],
            color: readableOn(scheme[role]),
            borderRadius: 2,
            p: 1.5,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="labelLarge" component="p">
            {role}
          </Typography>
          <Typography variant="bodySmall" component="p">
            {scheme[role]}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function ContrastTable({ scheme }: { scheme: M3Scheme }) {
  const t = useTranslations("ThemeDemo");
  return (
    <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", mt: 2 }}>
      <caption style={{ textAlign: "left" }}>
        <Typography variant="titleSmall" component="span">
          {t("contrastCaption")}
        </Typography>
      </caption>
      <thead>
        <tr>
          <Box component="th" scope="col" sx={{ textAlign: "left", py: 0.5 }}>
            {t("pair")}
          </Box>
          <Box component="th" scope="col" sx={{ textAlign: "right", py: 0.5 }}>
            {t("ratio")}
          </Box>
        </tr>
      </thead>
      <tbody>
        {CONTRAST_PAIRS.map(([foreground, background, min]) => {
          const ratio = contrastRatio(scheme[foreground], scheme[background]);
          return (
            <tr key={`${foreground}-${background}`}>
              <Box component="td" sx={{ py: 0.5 }}>
                <Box
                  component="span"
                  sx={{
                    backgroundColor: scheme[background],
                    color: scheme[foreground],
                    px: 1,
                    borderRadius: 1,
                  }}
                >
                  {foreground} / {background}
                </Box>
              </Box>
              <Box component="td" sx={{ textAlign: "right", py: 0.5 }}>
                {t(ratio >= min ? "ratioPass" : "ratioFail", {
                  ratio: formatRatio(ratio),
                  min: formatRatio(min),
                })}
              </Box>
            </tr>
          );
        })}
      </tbody>
    </Box>
  );
}

/**
 * Page de démonstration du thème d'une AMAP : rôles de couleur M3 (clair et sombre) avec leurs
 * contrastes, échelle typographique et principaux composants, dans le mode d'affichage courant.
 */
export function ThemeDemo({
  amapName,
  config,
  otherAmaps,
}: {
  amapName: string;
  config: ThemeConfig;
  otherAmaps: { slug: string; name: string; current: boolean }[];
}) {
  const t = useTranslations("ThemeDemo");
  const showSnackbar = useSnackbar();
  const schemes = useMemo(() => createM3Schemes(config.keyColors), [config.keyColors]);
  const [quantity, setQuantity] = useState("2");
  const [filters, setFilters] = useState<string[]>(["vegetables"]);

  const toggleFilter = (filter: string) =>
    setFilters((current) =>
      current.includes(filter) ? current.filter((f) => f !== filter) : [...current, filter],
    );

  return (
    <Box sx={{ minHeight: "100dvh" }}>
      <AppBar position="sticky" component="header">
        <Toolbar sx={{ gap: 2, minHeight: 64 }}>
          <Typography component="p" variant="headlineSmall" noWrap sx={{ flex: 1 }}>
            {amapName}
          </Typography>
          <ColorModeToggle />
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        id="contenu"
        tabIndex={-1}
        sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, md: 4 }, py: 4, outline: "none" }}
      >
        <Typography variant="h1" gutterBottom>
          {t("title", { amap: amapName })}
        </Typography>
        <Typography sx={{ mb: 2 }}>
          {t("intro", { font: config.headingFont })}
        </Typography>

        <Stack component="nav" aria-label={t("otherAmaps")} direction="row" spacing={1} sx={{ mb: 4 }}>
          {otherAmaps.map((other) => (
            <Button
              key={other.slug}
              component={Link}
              href={`/plateforme/theme/${other.slug}`}
              nativeButton={false}
              variant={other.current ? "tonal" : "outlined"}
              aria-current={other.current ? "page" : undefined}
            >
              {other.name}
            </Button>
          ))}
        </Stack>

        <Box component="section" aria-labelledby="couleurs" sx={{ mb: 6 }}>
          <Typography id="couleurs" variant="h2" gutterBottom>
            {t("colors")}
          </Typography>
          <Box sx={{ display: "grid", gap: 4, gridTemplateColumns: { md: "1fr 1fr" } }}>
            {(["light", "dark"] as const).map((mode) => (
              <Box key={mode}>
                <Typography variant="h3" gutterBottom>
                  {t(mode)}
                </Typography>
                <Swatches scheme={schemes[mode]} />
                <ContrastTable scheme={schemes[mode]} />
              </Box>
            ))}
          </Box>
        </Box>

        <Box component="section" aria-labelledby="typographie" sx={{ mb: 6 }}>
          <Typography id="typographie" variant="h2" gutterBottom>
            {t("typography")}
          </Typography>
          <Stack spacing={1}>
            {TYPOGRAPHY_VARIANTS.map((variant) => (
              <Typography key={variant} variant={variant} component="p">
                {variant} — {t("sample")}
              </Typography>
            ))}
          </Stack>
        </Box>

        <Box component="section" aria-labelledby="boutons" sx={{ mb: 6 }}>
          <Typography id="boutons" variant="h2" gutterBottom>
            {t("buttons")}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mb: 2 }}>
            <Button variant="contained">{t("filled")}</Button>
            <Button variant="tonal">{t("tonal")}</Button>
            <Button variant="outlined">{t("outlined")}</Button>
            <Button variant="text">{t("text")}</Button>
            <Button variant="contained" disabled>
              {t("disabled")}
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button variant="contained" color="secondary">
              {t("secondary")}
            </Button>
            <Button variant="contained" color="tertiary">
              {t("tertiary")}
            </Button>
            <Button variant="contained" color="error">
              {t("error")}
            </Button>
          </Stack>
        </Box>

        <Box component="section" aria-labelledby="composants" sx={{ mb: 6 }}>
          <Typography id="composants" variant="h2" gutterBottom>
            {t("components")}
          </Typography>

          <Stack
            component="fieldset"
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap", border: 0, p: 0, m: 0, mb: 3 }}
          >
            <Typography component="legend" variant="titleSmall" sx={{ mb: 1 }}>
              {t("filtersLegend")}
            </Typography>
            {(["vegetables", "fruits", "dairy"] as const).map((filter) => (
              <Chip
                key={filter}
                label={t(`filter.${filter}`)}
                color={filters.includes(filter) ? "primary" : "default"}
                variant={filters.includes(filter) ? "filled" : "outlined"}
                onClick={() => toggleFilter(filter)}
                aria-pressed={filters.includes(filter)}
              />
            ))}
          </Stack>

          <Card sx={{ maxWidth: 420, mb: 3 }}>
            <CardContent>
              <Typography variant="titleLarge" component="h3" gutterBottom>
                {t("cardTitle")}
              </Typography>
              <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 2 }}>
                {t("cardText")}
              </Typography>
              <TextField
                label={t("quantity")}
                type="number"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }}
              />
            </CardContent>
            <CardActions sx={{ px: 2, pb: 2 }}>
              <Button
                variant="contained"
                onClick={() => {
                  const previous = quantity;
                  showSnackbar({
                    message: t("saved"),
                    onUndo: () => {
                      setQuantity(previous);
                      showSnackbar({ message: t("undone") });
                    },
                  });
                }}
              >
                {t("save")}
              </Button>
            </CardActions>
          </Card>

          <Typography variant="titleSmall" component="h3" gutterBottom>
            {t("skeleton")}
          </Typography>
          <Stack spacing={1} sx={{ maxWidth: 420 }} aria-hidden>
            <Skeleton variant="text" sx={{ fontSize: "1.5rem" }} width="60%" />
            <Skeleton variant="rounded" height={72} />
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
