"use client";

import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useId } from "react";

import {
  MAX_REPORT_COMMENT_LENGTH,
  REPORT_REASONS,
  type ReportProblem,
  type ReportReason,
} from "@/domain/reports";

export type ReportFieldValues = { quantity: string; reason: ReportReason; comment: string };

/**
 * Champs communs d'un signalement (story F5) : quantité (au plus ce qui reste à signaler),
 * motif (manquant, abîmé, autre) et précision, obligatoire pour « Autre ». Utilisés par la
 * famille et par l'admin (feuille d'émargement).
 */
export function ReportFields({
  values,
  onChange,
  max,
  problems,
}: {
  values: ReportFieldValues;
  onChange: (values: ReportFieldValues) => void;
  /** Quantité encore signalable sur la ligne choisie. */
  max: number;
  problems: readonly ReportProblem[];
}) {
  const t = useTranslations("Reports.form");
  const id = useId();
  const reasonLabel = `${id}-motif`;
  return (
    <Stack spacing={2.5}>
      <TextField
        id={`${id}-quantite`}
        label={t("quantity")}
        type="number"
        value={values.quantity}
        onChange={(e) => onChange({ ...values, quantity: e.target.value })}
        error={problems.includes("quantity")}
        helperText={
          problems.includes("quantity") ? t("errors.quantity", { max }) : t("quantityHelp", { max })
        }
        slotProps={{ htmlInput: { min: 1, max, inputMode: "numeric" } }}
        sx={{ maxWidth: 200 }}
      />
      <FormControl>
        <FormLabel id={reasonLabel} sx={{ color: "text.primary" }}>
          {t("reason")}
        </FormLabel>
        <RadioGroup
          aria-labelledby={reasonLabel}
          value={values.reason}
          onChange={(e) => onChange({ ...values, reason: e.target.value as ReportReason })}
        >
          {REPORT_REASONS.map((reason) => (
            <FormControlLabel
              key={reason}
              value={reason}
              control={<Radio />}
              label={t(`reasons.${reason}`)}
            />
          ))}
        </RadioGroup>
      </FormControl>
      <TextField
        id={`${id}-precision`}
        label={values.reason === "other" ? t("commentRequired") : t("comment")}
        multiline
        minRows={2}
        value={values.comment}
        required={values.reason === "other"}
        onChange={(e) => onChange({ ...values, comment: e.target.value })}
        error={problems.includes("comment_required") || problems.includes("comment_too_long")}
        helperText={
          problems.includes("comment_required")
            ? t("errors.comment_required")
            : problems.includes("comment_too_long")
              ? t("errors.comment_too_long", { max: MAX_REPORT_COMMENT_LENGTH })
              : undefined
        }
        slotProps={{ htmlInput: { maxLength: MAX_REPORT_COMMENT_LENGTH } }}
      />
    </Stack>
  );
}
