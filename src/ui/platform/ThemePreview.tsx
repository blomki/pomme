"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { findContrastFailures } from "../theme/contrast";
import type { HeadingFont } from "../theme/key-colors";
import { createM3Schemes, isHexColor, type KeyColors, type M3Scheme } from "../theme/m3-colors";
import { headingFontFamily } from "../theme/typography";

/** Un petit écran d'exemple, dessiné avec les couleurs d'un schéma (clair ou sombre). */
function Sample({
  scheme,
  label,
  headingFont,
}: {
  scheme: M3Scheme;
  label: string;
  headingFont: HeadingFont;
}) {
  const t = useTranslations("Platform");
  return (
    <Box
      component="figure"
      aria-label={label}
      sx={{ m: 0, flex: 1, minWidth: 220, borderRadius: 4, overflow: "hidden" }}
      style={{
        background: scheme.surface,
        color: scheme.onSurface,
        border: `1px solid ${scheme.outlineVariant}`,
      }}
    >
      <Box
        sx={{ px: 2, py: 1.5 }}
        style={{ background: scheme.primaryContainer, color: scheme.onPrimaryContainer }}
      >
        <Typography
          component="p"
          sx={{ fontFamily: headingFontFamily(headingFont), fontSize: "1.4rem" }}
        >
          {t("previewTitle")}
        </Typography>
      </Box>
      <Stack spacing={1.5} sx={{ p: 2 }}>
        <Typography variant="bodyMedium">{t("previewText")}</Typography>
        <Box
          sx={{ p: 1.5, borderRadius: 3 }}
          style={{ background: scheme.surfaceContainer, color: scheme.onSurfaceVariant }}
        >
          <Typography variant="bodySmall">{t("previewLink")}</Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Box
            component="span"
            sx={{ px: 2.5, py: 1, borderRadius: 5, fontWeight: 500 }}
            style={{ background: scheme.primary, color: scheme.onPrimary }}
          >
            {t("previewButton")}
          </Box>
          <Box
            component="span"
            sx={{ px: 1.5, py: 0.5, borderRadius: 2, fontSize: "0.8rem", fontWeight: 500 }}
            style={{ background: scheme.secondaryContainer, color: scheme.onSecondaryContainer }}
          >
            {t("previewChip")}
          </Box>
          <Box
            component="span"
            sx={{ px: 1.5, py: 0.5, borderRadius: 2, fontSize: "0.8rem", fontWeight: 500 }}
            style={{ background: scheme.tertiaryContainer, color: scheme.onTertiaryContainer }}
          >
            {t("previewFollowUp")}
          </Box>
          <Box
            component="span"
            sx={{ textDecoration: "underline" }}
            style={{ color: scheme.primary }}
          >
            {t("previewLink")}
          </Box>
        </Stack>
      </Stack>
      <Box component="figcaption" sx={{ px: 2, pb: 1.5 }}>
        <Typography variant="labelMedium">{label}</Typography>
      </Box>
    </Box>
  );
}

/**
 * Aperçu du thème d'une AMAP, en clair et en sombre, recalculé à chaque changement de couleur
 * ou de police (stories J1 et A4). Signale les combinaisons dont le contraste est insuffisant
 * (WCAG 2.2, 4,5:1 pour le texte), sans bloquer : le gestionnaire choisit.
 */
export function ThemePreview({
  colors,
  headingFont,
}: {
  colors: KeyColors;
  headingFont: HeadingFont;
}) {
  const t = useTranslations("Platform");
  const valid = [colors.primary, colors.secondary, colors.tertiary].every(
    (c) => c !== undefined && isHexColor(c),
  );
  const schemes = useMemo(() => (valid ? createM3Schemes(colors) : null), [valid, colors]);
  if (!schemes) return null;
  const failures = {
    light: findContrastFailures(schemes.light),
    dark: findContrastFailures(schemes.dark),
  };
  const failing = (["light", "dark"] as const).filter((mode) => failures[mode].length > 0);
  const count = failures.light.length + failures.dark.length;

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap" }}>
        <Sample scheme={schemes.light} label={t("previewLight")} headingFont={headingFont} />
        <Sample scheme={schemes.dark} label={t("previewDark")} headingFont={headingFont} />
      </Stack>
      <Alert severity={count === 0 ? "success" : "warning"} role="status">
        {count === 0
          ? t("contrastOk")
          : t("contrastFail", {
              count,
              modes: failing
                .map((m) => t(m === "light" ? "previewLight" : "previewDark").toLowerCase())
                .join(", "),
            })}
      </Alert>
    </Stack>
  );
}
