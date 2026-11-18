"use client";

import ErrorOutlined from "@mui/icons-material/ErrorOutlined";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { formatDate } from "@/i18n/dates";
import type { BlockingTask } from "@/server/producers";

/** Un jour du calendrier (« 2026-11-15 ») affiché en français, sans effet de fuseau. */
const day = (date: string, pattern: string) => formatDate(`${date}T12:00:00Z`, pattern);

/**
 * Tâches « Bloquant » du tableau de bord admin : détectées automatiquement, elles disparaissent
 * d'elles-mêmes une fois le problème réglé (rien à cocher). Producteur sans référent (C1),
 * catalogue pas encore publié à trois jours de l'ouverture des commandes (C3).
 */
export function BlockingTasks({ amapSlug, tasks }: { amapSlug: string; tasks: BlockingTask[] }) {
  const t = useTranslations("Admin.dashboard");
  return (
    <Paper variant="outlined" component="section" aria-labelledby="tasks-title" sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <Typography id="tasks-title" variant="h2">
          {t("tasksTitle")}
        </Typography>
      </Stack>
      {tasks.length === 0 ? (
        <Typography>{t("noBlocking")}</Typography>
      ) : (
        <List>
          {tasks.map((task) => (
            <ListItem key={`${task.kind}-${task.amapProducerId}`} divider>
              <ListItemIcon>
                <ErrorOutlined sx={{ color: "error.main" }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Chip size="small" color="error" label={t("blocking")} />
                    <span>
                      {task.kind === "producer_without_referent"
                        ? t("producerWithoutReferent", { name: task.name })
                        : t("catalogNotPublished", {
                            name: task.name,
                            month: day(`${task.month}-01`, "MMMM"),
                            opensOn: day(task.opensOn, "d MMMM"),
                          })}
                    </span>
                  </Stack>
                }
                secondary={
                  <MuiLink
                    component={Link}
                    href={`/${amapSlug}/admin/producteurs/${task.amapProducerId}`}
                  >
                    {task.kind === "producer_without_referent"
                      ? t("assignReferent", { name: task.name })
                      : t("contactReferent", { name: task.name })}
                  </MuiLink>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
