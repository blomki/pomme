"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { AMAP_TIMEZONES } from "@/domain/amap-creation";
import { suggestAmapSlug } from "@/domain/amap-slug";
import { WEEKDAYS } from "@/domain/distributions";
import type { FieldProblem } from "@/server/amap-creation";
import { createAmapAction } from "@/server/platform-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { HEADING_FONTS, PLATFORM_KEY_COLORS, type HeadingFont } from "../theme/key-colors";

import { ThemePreview } from "./ThemePreview";

type Field = FieldProblem["field"];

const EMPTY = {
  name: "",
  slug: "",
  primary: PLATFORM_KEY_COLORS.primary,
  secondary: PLATFORM_KEY_COLORS.secondary,
  tertiary: PLATFORM_KEY_COLORS.tertiary,
  headingFont: "Carlito" as HeadingFont,
  place: "",
  weekday: "4",
  startTime: "18:00",
  endTime: "19:30",
  timezone: "Europe/Paris",
  contactEmail: "",
  adminEmail: "",
  adminFirstName: "",
  adminLastName: "",
};
type Values = typeof EMPTY;

/**
 * « Créer une AMAP » (story J1), réservé au gestionnaire de la plateforme : l'AMAP, ses
 * couleurs et sa police (aperçu clair et sombre, contraste vérifié), sa distribution, puis son
 * premier administrateur, invité par email.
 */
export function NewAmapForm({ baseUrl }: { baseUrl: string }) {
  const t = useTranslations("Platform");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const [values, setValues] = useState<Values>(EMPTY);
  // L'adresse suit le nom tant qu'on ne l'a pas modifiée à la main.
  const [slugTouched, setSlugTouched] = useState(false);
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [slugTaken, setSlugTaken] = useState(false);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setValues((v) => ({
      ...v,
      [field]: value,
      ...(field === "name" && !slugTouched ? { slug: suggestAmapSlug(value) } : {}),
    }));
    if (field === "slug") {
      setSlugTouched(true);
      setSlugTaken(false);
    }
  };
  const problemOf = (field: Field) => problems.find((p) => p.field === field);
  const fieldProps = (field: Field & keyof Values) => {
    const problem = problemOf(field);
    return {
      id: `amap-${field}`,
      name: field,
      value: values[field],
      onChange: set(field),
      error: Boolean(problem),
      helperText: problem ? t(`problems.${problem.problem}`) : undefined,
      fullWidth: true,
    };
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await createAmapAction({
      name: values.name,
      slug: values.slug,
      primary: values.primary,
      secondary: values.secondary,
      tertiary: values.tertiary,
      headingFont: values.headingFont,
      place: values.place,
      weekday: Number(values.weekday),
      startTime: values.startTime,
      endTime: values.endTime,
      timezone: values.timezone,
      contactEmail: values.contactEmail.trim(),
      admin: {
        email: values.adminEmail.trim(),
        firstName: values.adminFirstName,
        lastName: values.adminLastName,
      },
    });
    setPending(false);
    if (result.status === "created") {
      const email = values.adminEmail.trim().toLowerCase();
      showSnackbar({
        message: result.invitationSent
          ? t("created", { name: values.name.trim(), email })
          : t("createdNoEmail", { name: values.name.trim(), email, base: baseUrl }),
      });
      router.push("/plateforme");
      return;
    }
    setProblems(result.status === "invalid" ? result.problems : []);
    setSlugTaken(result.status === "slug_taken");
    setSummary(
      result.status === "slug_taken"
        ? t("slugTaken")
        : result.status === "forbidden"
          ? t("forbidden")
          : t("fixErrors"),
    );
    // Le résumé prend le focus, pour qu'un lecteur d'écran l'annonce aussitôt.
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const section = (id: string, title: string, children: React.ReactNode) => (
    <Paper
      variant="outlined"
      component="fieldset"
      aria-labelledby={id}
      sx={{ p: 3, m: 0, minWidth: 0 }}
    >
      <Typography id={id} variant="h2" component="legend" sx={{ px: 1, mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={2.5}>{children}</Stack>
    </Paper>
  );

  return (
    <Box component="form" onSubmit={(e) => void submit(e)} noValidate sx={{ maxWidth: 820 }}>
      <Stack spacing={3}>
        {summary && (
          <Alert severity="error" ref={summaryRef} tabIndex={-1}>
            {summary}
          </Alert>
        )}

        {section(
          "identite",
          t("sections.identity"),
          <>
            <TextField {...fieldProps("name")} label={t("fields.name")} required />
            <TextField
              {...fieldProps("slug")}
              label={t("fields.slug")}
              required
              error={slugTaken || Boolean(problemOf("slug"))}
              helperText={
                slugTaken
                  ? t("slugTaken")
                  : problemOf("slug")
                    ? t(`problems.${problemOf("slug")!.problem}`)
                    : t("fields.slugHelp", { base: baseUrl, slug: values.slug || "…" })
              }
            />
            <TextField
              {...fieldProps("contactEmail")}
              label={t("fields.contactEmail")}
              type="email"
              autoComplete="off"
            />
          </>,
        )}

        {section(
          "theme",
          t("sections.theme"),
          <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {(["primary", "secondary", "tertiary"] as const).map((field) => (
                <Stack
                  key={field}
                  direction="row"
                  spacing={1}
                  sx={{ flex: 1, alignItems: "flex-start" }}
                >
                  <TextField
                    {...fieldProps(field)}
                    label={t(`fields.${field}`)}
                    helperText={problemOf(field) ? t("problems.color") : t("fields.colorHelp")}
                    required
                  />
                  {/* Sélecteur de couleur du navigateur, en complément du champ texte. */}
                  <Box
                    component="input"
                    type="color"
                    aria-label={t("pickColor", { label: t(`fields.${field}`).toLowerCase() })}
                    value={/^#[0-9a-fA-F]{6}$/.test(values[field]) ? values[field] : "#000000"}
                    onChange={set(field)}
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
            <TextField {...fieldProps("headingFont")} select label={t("fields.headingFont")}>
              {HEADING_FONTS.map((font) => (
                <MenuItem key={font} value={font}>
                  {font}
                </MenuItem>
              ))}
            </TextField>
            <Box component="section" aria-labelledby="apercu">
              <Typography id="apercu" variant="titleMedium" component="h3" sx={{ mb: 1 }}>
                {t("preview")}
              </Typography>
              <ThemePreview
                colors={{
                  primary: values.primary,
                  secondary: values.secondary,
                  tertiary: values.tertiary,
                }}
                headingFont={values.headingFont}
              />
            </Box>
          </>,
        )}

        {section(
          "distribution",
          t("sections.distribution"),
          <>
            <TextField {...fieldProps("place")} label={t("fields.place")} required />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField {...fieldProps("weekday")} select label={t("fields.weekday")} required>
                {WEEKDAYS.map((d) => (
                  <MenuItem key={d} value={String(d)}>
                    {t(`weekdays.${d}`)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                {...fieldProps("startTime")}
                type="time"
                label={t("fields.startTime")}
                required
              />
              <TextField
                {...fieldProps("endTime")}
                type="time"
                label={t("fields.endTime")}
                required
              />
            </Stack>
            <TextField {...fieldProps("timezone")} select label={t("fields.timezone")} required>
              {AMAP_TIMEZONES.map((zone) => (
                <MenuItem key={zone} value={zone}>
                  {t(`timezones.${zone}`)}
                </MenuItem>
              ))}
            </TextField>
          </>,
        )}

        {section(
          "administrateur",
          t("sections.admin"),
          <>
            <TextField
              {...fieldProps("adminEmail")}
              label={t("fields.adminEmail")}
              type="email"
              autoComplete="off"
              required
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                {...fieldProps("adminFirstName")}
                label={t("fields.adminFirstName")}
                required
              />
              <TextField {...fieldProps("adminLastName")} label={t("fields.adminLastName")} />
            </Stack>
          </>,
        )}

        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("submit")}
          </Button>
          <Button component={Link} nativeButton={false} href="/plateforme">
            {t("cancel")}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
