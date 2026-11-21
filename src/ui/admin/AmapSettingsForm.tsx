"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { AMAP_PARAMETER_BOUNDS, type AmapParameter } from "@/domain/amap-settings";
import {
  removeAmapLogoAction,
  saveAmapLogoAction,
  saveAmapSettingsAction,
} from "@/server/amap-settings-actions";
import type { AmapSettingsView, SaveSettingsProblem } from "@/server/amap-settings";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { ImageUpload } from "../forms/ImageUpload";
import { ThemePreview } from "../platform/ThemePreview";
import { HEADING_FONTS, type HeadingFont } from "../theme/key-colors";

const COLORS = ["primary", "secondary", "tertiary"] as const;
const PARAMETERS = Object.keys(AMAP_PARAMETER_BOUNDS) as AmapParameter[];

/**
 * « Réglages de l'AMAP » (story A4) : nom affiché (l'adresse ne change pas ici), logo, couleurs
 * clés et police des titres avec aperçu clair et sombre, email de contact, paramètres. Le lieu et
 * les horaires de distribution se règlent depuis le planning.
 */
export function AmapSettingsForm({
  amapSlug,
  settings,
  storageEnabled,
  weekdayLabel,
}: {
  amapSlug: string;
  settings: AmapSettingsView;
  storageEnabled: boolean;
  /** Jour habituel en toutes lettres (« jeudi »), ou null. */
  weekdayLabel: string | null;
}) {
  const t = useTranslations("Admin.settings");
  const tp = useTranslations("Platform");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const [values, setValues] = useState({
    name: settings.name,
    ...settings.colors,
    headingFont: settings.headingFont as HeadingFont,
    contactEmail: settings.contactEmail,
    ...Object.fromEntries(PARAMETERS.map((p) => [p, String(settings.parameters[p])])),
  } as Record<string, string>);
  const [problems, setProblems] = useState<SaveSettingsProblem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const problemOf = (field: string) => problems.find((p) => p.field === field);
  const field = (name: string) => ({
    id: `reglage-${name}`,
    name,
    value: values[name] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
    error: Boolean(problemOf(name)),
    fullWidth: true,
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await saveAmapSettingsAction(amapSlug, values);
    setPending(false);
    if (result.status === "saved") {
      setProblems([]);
      setSummary(null);
      showSnackbar({ message: t("saved") });
      router.refresh();
      return;
    }
    setProblems(result.status === "invalid" ? result.problems : []);
    setSummary(result.status === "forbidden" ? t("forbidden") : t("fixErrors"));
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const card = (id: string, title: string, children: React.ReactNode) => (
    <Paper variant="outlined" component="section" aria-labelledby={id} sx={{ p: 3 }}>
      <Typography id={id} variant="h2" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Stack spacing={2.5}>{children}</Stack>
    </Paper>
  );

  return (
    <Stack spacing={3} sx={{ maxWidth: 820 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <ImageUpload
          title={t("logo")}
          current={settings.logoUrl ? { url: settings.logoUrl, alt: settings.name } : null}
          fallbackAlt={t("logoAlt", { name: settings.name })}
          enabled={storageEnabled}
          withAlt={false}
          fit="contain"
          onSave={(form) => saveAmapLogoAction(amapSlug, form)}
          onRemove={() => removeAmapLogoAction(amapSlug)}
          onSaved={(what) => {
            showSnackbar({ message: t(what === "saved" ? "logoSaved" : "logoRemoved") });
            router.refresh();
          }}
        />
      </Paper>

      <Box component="form" onSubmit={(e) => void submit(e)} noValidate>
        <Stack spacing={3}>
          {summary && (
            <Alert severity="error" ref={summaryRef} tabIndex={-1}>
              {summary}
            </Alert>
          )}

          {card(
            "identite",
            t("identity"),
            <>
              <TextField
                {...field("name")}
                label={t("name")}
                required
                helperText={problemOf("name") && tp(`problems.${problemOf("name")!.problem}`)}
              />
              <TextField
                id="reglage-adresse"
                label={t("slug")}
                value={`/${settings.slug}`}
                slotProps={{ htmlInput: { readOnly: true } }}
                helperText={t("slugHelp")}
              />
              <TextField
                {...field("contactEmail")}
                type="email"
                label={t("contactEmail")}
                helperText={problemOf("contactEmail") ? t("emailInvalid") : t("contactEmailHelp")}
              />
            </>,
          )}

          {card(
            "theme",
            t("theme"),
            <>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                {COLORS.map((color) => (
                  <Stack key={color} direction="row" spacing={1} sx={{ flex: 1 }}>
                    <TextField
                      {...field(color)}
                      label={tp(`fields.${color}`)}
                      required
                      helperText={problemOf(color) ? tp("problems.color") : tp("fields.colorHelp")}
                    />
                    <Box
                      component="input"
                      type="color"
                      aria-label={tp("pickColor", {
                        label: tp(`fields.${color}`).toLowerCase(),
                      })}
                      value={/^#[0-9a-fA-F]{6}$/.test(values[color]!) ? values[color] : "#000000"}
                      onChange={field(color).onChange}
                      sx={{
                        width: 48,
                        height: 56,
                        p: 0.5,
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 1,
                        bgcolor: "transparent",
                        cursor: "pointer",
                      }}
                    />
                  </Stack>
                ))}
              </Stack>
              <TextField {...field("headingFont")} select label={tp("fields.headingFont")}>
                {HEADING_FONTS.map((font) => (
                  <MenuItem key={font} value={font}>
                    {font}
                  </MenuItem>
                ))}
              </TextField>
              <Box component="section" aria-labelledby="apercu">
                <Typography id="apercu" variant="titleMedium" component="h3" sx={{ mb: 1 }}>
                  {tp("preview")}
                </Typography>
                <ThemePreview
                  colors={{
                    primary: values.primary!,
                    secondary: values.secondary!,
                    tertiary: values.tertiary!,
                  }}
                  headingFont={values.headingFont as HeadingFont}
                />
              </Box>
            </>,
          )}

          {card(
            "parametres",
            t("parameters"),
            <>
              {PARAMETERS.map((p) => (
                <TextField
                  key={p}
                  {...field(p)}
                  type="number"
                  label={t(`parameter.${p}`)}
                  required
                  helperText={
                    problemOf(p) ? t("range", AMAP_PARAMETER_BOUNDS[p]) : t(`parameterHelp.${p}`)
                  }
                  slotProps={{
                    htmlInput: {
                      min: AMAP_PARAMETER_BOUNDS[p].min,
                      max: AMAP_PARAMETER_BOUNDS[p].max,
                    },
                  }}
                  sx={{ maxWidth: 360 }}
                />
              ))}
            </>,
          )}

          <Box>
            <Button type="submit" variant="contained" disabled={pending}>
              {t("save")}
            </Button>
          </Box>
        </Stack>
      </Box>

      {card(
        "distribution",
        t("distribution"),
        <>
          <Typography>
            {settings.distribution.place ?? t("noPlace")}
            {weekdayLabel && settings.distribution.startTime && settings.distribution.endTime
              ? ` · ${t("schedule", {
                  day: weekdayLabel,
                  start: settings.distribution.startTime,
                  end: settings.distribution.endTime,
                })}`
              : ""}
          </Typography>
          <Box>
            <MuiLink component={Link} href={`/${amapSlug}/admin/planning`}>
              {t("distributionLink")}
            </MuiLink>
          </Box>
        </>,
      )}
    </Stack>
  );
}
