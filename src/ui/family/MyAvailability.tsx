"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { formatDate } from "@/i18n/dates";
import { saveMyAvailabilityAction } from "@/server/duty-plans-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";

const longDay = (day: string) => formatDate(`${day}T12:00:00Z`, "EEEE d MMMM");

/**
 * « Mes disponibilités » (écran 7, story G1) : les distributions du trimestre, groupées par
 * mois, une case « indisponible » par date. Rien coché = disponible partout. Après l'envoi, la
 * réponse se relit et reste modifiable jusqu'à la date limite ; ensuite, lecture seule.
 */
export function MyAvailability({
  amapSlug,
  planId,
  deadlineOn,
  phase,
  distributions,
  unavailable,
  answeredOn,
}: {
  amapSlug: string;
  planId: string;
  deadlineOn: string;
  phase: "open" | "closed";
  distributions: Array<{ id: string; date: string }>;
  unavailable: string[];
  answeredOn: string | null;
}) {
  const t = useTranslations("Family.availability");
  const showSnackbar = useSnackbar();
  const [picked, setPicked] = useState<string[]>(unavailable);
  const [answered, setAnswered] = useState(answeredOn !== null);
  const [editing, setEditing] = useState(answeredOn === null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const late = phase === "closed";
  const editable = editing && !late;
  const deadline = longDay(deadlineOn);

  // Distributions groupées par mois (« janvier 2027 »), dans l'ordre des dates.
  const months: Array<{ month: string; days: typeof distributions }> = [];
  for (const d of distributions) {
    const month = d.date.slice(0, 7);
    const group = months.at(-1);
    if (group?.month === month) group.days.push(d);
    else months.push({ month, days: [d] });
  }

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const send = () =>
    startTransition(async () => {
      const result = await saveMyAvailabilityAction(amapSlug, { planId, distributionIds: picked });
      if (result.status === "saved") {
        setError(false);
        setAnswered(true);
        setEditing(false);
        showSnackbar({ message: t("sent") });
      } else {
        setError(true);
      }
    });

  const status = late
    ? { text: t("closed", { deadline }), bg: m3("surfaceContainerHighest"), fg: m3("onSurface") }
    : answered && !editing
      ? {
          text: t("saved", { deadline }),
          bg: m3("secondaryContainer"),
          fg: m3("onSecondaryContainer"),
        }
      : {
          text: t("toSend", { deadline }),
          bg: m3("tertiaryContainer"),
          fg: m3("onTertiaryContainer"),
        };

  return (
    <Stack spacing={2}>
      <Box role="status" sx={{ p: 2, borderRadius: 3, bgcolor: status.bg, color: status.fg }}>
        <Typography variant="bodyMedium">{status.text}</Typography>
      </Box>
      {error && <Alert severity="error">{t("error")}</Alert>}
      {editable && <Typography color="text.secondary">{t("intro")}</Typography>}
      {distributions.length === 0 && <Typography>{t("noDistribution")}</Typography>}

      {months.map(({ month, days }) => (
        <Box component="fieldset" key={month} sx={{ border: 0, m: 0, p: 0 }}>
          <Typography component="legend" variant="titleMedium" sx={{ mb: 1 }}>
            {formatDate(`${month}-01T12:00:00Z`, "MMMM yyyy")}
          </Typography>
          <Stack spacing={1}>
            {days.map((d) => {
              const off = picked.includes(d.id);
              return (
                <Paper
                  key={d.id}
                  variant="outlined"
                  sx={{
                    px: 1.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    bgcolor: off ? m3("tertiaryContainer") : undefined,
                    color: off ? m3("onTertiaryContainer") : undefined,
                  }}
                >
                  <FormControlLabel
                    sx={{ flex: 1, m: 0, minHeight: 48 }}
                    control={
                      <Checkbox checked={off} disabled={!editable} onChange={() => toggle(d.id)} />
                    }
                    label={longDay(d.date)}
                  />
                  {(off || !editable) && (
                    <Typography variant="bodySmall">
                      {off ? t("unavailable") : t("available")}
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Box>
      ))}

      {/* Barre du bas : compteur et envoi, toujours à portée de pouce. */}
      <Paper
        elevation={3}
        sx={{
          // Collée au-dessus de la barre de navigation du bas (56 px).
          position: "sticky",
          bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          bgcolor: m3("surfaceContainer"),
          zIndex: 2,
        }}
      >
        <Box>
          <Typography variant="bodySmall" color="text.secondary" component="p">
            {t("countLabel")}
          </Typography>
          <Typography variant="titleMedium" component="p" aria-live="polite">
            {t("count", { count: picked.length, total: distributions.length })}
          </Typography>
        </Box>
        {editable && (
          <Button variant="contained" onClick={send} disabled={pending}>
            {answered ? t("update") : picked.length === 0 ? t("sendNone") : t("send")}
          </Button>
        )}
        {!editable && !late && (
          <Button variant="outlined" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
        )}
      </Paper>
    </Stack>
  );
}
