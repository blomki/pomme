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

type Task = { kind: "producer_without_referent"; amapProducerId: string; name: string };

/**
 * Tâches « Bloquant » du tableau de bord admin : détectées automatiquement, elles disparaissent
 * d'elles-mêmes une fois le problème réglé (rien à cocher).
 */
export function BlockingTasks({ amapSlug, tasks }: { amapSlug: string; tasks: Task[] }) {
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
            <ListItem key={task.amapProducerId} divider>
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
                    <span>{t("producerWithoutReferent", { name: task.name })}</span>
                  </Stack>
                }
                secondary={
                  <MuiLink
                    component={Link}
                    href={`/${amapSlug}/admin/producteurs/${task.amapProducerId}`}
                  >
                    {t("assignReferent", { name: task.name })}
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
