"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import type { ProducerHomeTask } from "@/domain/producers";
import { formatDate } from "@/i18n/dates";
import { chooseCurrentProducerAmapAction } from "@/server/producer-amaps-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";

import { amapInitials } from "./initials";

type AmapChoice = { amapProducerId: string; label: string };

/**
 * Accueil du producteur (écran P1, story C4) : logo et nom de l'AMAP courante, liste pour en
 * changer (seulement s'il en livre au moins deux), puis la seule action datée : publier son
 * catalogue avant l'ouverture des commandes.
 */
export function ProducerHome({
  amap,
  amaps,
  currentId,
  task,
}: {
  amap: { name: string; logoUrl: string | null };
  amaps: AmapChoice[];
  currentId: string;
  task: ProducerHomeTask | null;
}) {
  const t = useTranslations("Producer.home");
  const showSnackbar = useSnackbar();
  const [pending, setPending] = useState(false);

  const choose = async (amapProducerId: string) => {
    // Le champ reste actif pendant l'enregistrement (il garde le focus) ; un deuxième choix
    // pendant ce temps est ignoré.
    if (pending || amapProducerId === currentId) return;
    setPending(true);
    try {
      const result = await chooseCurrentProducerAmapAction({ amapProducerId });
      showSnackbar({
        message:
          result.status === "saved" ? t("chosen", { name: result.amapName }) : t("chooseError"),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={4}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          {/* Image décorative : le nom de l'AMAP est écrit juste à côté. */}
          <Avatar
            src={amap.logoUrl ?? undefined}
            alt=""
            sx={{
              width: 64,
              height: 64,
              bgcolor: m3("primaryContainer"),
              color: m3("onPrimaryContainer"),
              typography: "titleLarge",
            }}
          >
            <span aria-hidden="true">{amapInitials(amap.name)}</span>
          </Avatar>
          <Typography component="h1" variant="headlineSmall">
            {amap.name}
          </Typography>
        </Stack>
        {amaps.length > 1 && (
          <TextField
            select
            label={t("currentAmap")}
            value={currentId}
            onChange={(e) => void choose(e.target.value)}
            fullWidth
          >
            {amaps.map((a) => (
              <MenuItem key={a.amapProducerId} value={a.amapProducerId}>
                {a.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {task ? (
        <TaskCard task={task} />
      ) : (
        <Typography color="text.secondary">{t("nothingToDo")}</Typography>
      )}
    </Stack>
  );
}

/** Carte « À faire avant le … » : publier le catalogue du mois. */
function TaskCard({ task }: { task: ProducerHomeTask }) {
  const t = useTranslations("Producer.home");
  const month = formatDate(`${task.month}-01T12:00:00Z`, "MMMM");
  const date = task.opensOn ? formatDate(`${task.opensOn}T12:00:00Z`, "d MMMM") : null;
  const when = !date
    ? t("taskNoDate")
    : task.ordersOpen
      ? t("taskOpen", { date })
      : t("taskBefore", { date });
  return (
    <Paper
      component="section"
      aria-labelledby="tache-catalogue"
      elevation={0}
      sx={{ p: 3, bgcolor: m3("surfaceContainer") }}
    >
      <Stack spacing={1.5}>
        <Typography variant="labelLarge" color="text.secondary" sx={{ textTransform: "uppercase" }}>
          {when}
        </Typography>
        <Typography id="tache-catalogue" component="h2" variant="titleLarge">
          {t("taskTitle", { month })}
        </Typography>
        <Typography variant="bodyMedium">
          {task.ordersOpen ? t("taskBodyOpen") : t("taskBody")}
        </Typography>
        <Box>
          <Button
            variant="contained"
            component={Link}
            nativeButton={false}
            href={`/producteur/catalogue?mois=${task.month}`}
          >
            {t("taskAction")}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
