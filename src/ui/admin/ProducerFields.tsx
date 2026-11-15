"use client";

import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

/** Valeurs saisies dans le formulaire d'un producteur (texte brut, vérifié par le serveur). */
export type ProducerFormValues = {
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  phone: string;
  email: string;
  checkPayee: string;
  distanceKm: string;
};

export const EMPTY_PRODUCER: ProducerFormValues = {
  name: "",
  category: "",
  shortDescription: "",
  description: "",
  phone: "",
  email: "",
  checkPayee: "",
  distanceKm: "",
};

/**
 * Champs d'un producteur, en deux groupes : sa fiche commune (toutes ses AMAP) et ses réglages
 * dans l'AMAP courante. Champs contrôlés : rien n'est perdu en cas d'erreur.
 */
export function ProducerFields({
  values,
  onChange,
  invalid,
}: {
  values: ProducerFormValues;
  onChange: (values: ProducerFormValues) => void;
  /** Champs refusés par le serveur. */
  invalid: readonly string[];
}) {
  const t = useTranslations("Admin.producerForm");
  const field = (name: keyof ProducerFormValues, extra: { help?: boolean } = {}) => {
    const error = invalid.includes(name);
    return {
      label: t(name),
      value: values[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ ...values, [name]: e.target.value }),
      error,
      helperText: error ? t(`errors.${name}`) : extra.help ? t(`${name}Help` as "phoneHelp") : " ",
      fullWidth: true,
    };
  };

  return (
    <Stack spacing={3}>
      <Stack component="fieldset" spacing={2} sx={{ border: 0, p: 0, m: 0 }}>
        <Typography component="legend" variant="titleLarge" sx={{ mb: 1 }}>
          {t("sheetTitle")}
        </Typography>
        <Typography variant="bodyMedium" sx={{ color: "text.secondary" }}>
          {t("sheetIntro")}
        </Typography>
        <TextField {...field("name")} required />
        <TextField {...field("category", { help: true })} />
        <TextField {...field("shortDescription", { help: true })} />
        <TextField {...field("description")} multiline minRows={3} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField {...field("phone", { help: true })} type="tel" autoComplete="off" />
          <TextField {...field("email", { help: true })} type="email" autoComplete="off" />
        </Stack>
      </Stack>
      <Stack component="fieldset" spacing={2} sx={{ border: 0, p: 0, m: 0 }}>
        <Typography component="legend" variant="titleLarge" sx={{ mb: 1 }}>
          {t("settingsTitle")}
        </Typography>
        <TextField {...field("checkPayee", { help: true })} />
        <TextField
          {...field("distanceKm", { help: true })}
          inputMode="numeric"
          sx={{ maxWidth: 280 }}
        />
      </Stack>
    </Stack>
  );
}
