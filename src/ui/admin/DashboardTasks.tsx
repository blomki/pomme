"use client";

import CheckOutlined from "@mui/icons-material/CheckOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { formatDate } from "@/i18n/dates";
import { markTaskDoneAction } from "@/server/admin-tasks-actions";
import type { FollowUpTaskView } from "@/server/admin-tasks";
import type { BlockingTask } from "@/server/producers";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";
import { visuallyHidden } from "../visually-hidden";

/** Un jour du calendrier (« 2026-11-15 ») affiché en français, sans effet de fuseau. */
const day = (date: string, pattern: string) => formatDate(`${date}T12:00:00Z`, pattern);

const levelChip = {
  width: "6.5rem",
  flexShrink: 0,
  fontWeight: 500,
} as const;

/** Une ligne de la liste : niveau, texte, lien vers l'écran concerné, puis l'action. */
function TaskRow({
  level,
  text,
  href,
  link,
  action,
}: {
  level: "blocking" | "followUp";
  text: string;
  href: string;
  link: string;
  action: React.ReactNode;
}) {
  const t = useTranslations("Admin.dashboard");
  return (
    <Stack
      component="li"
      direction={{ xs: "column", md: "row" }}
      sx={{
        gap: { xs: 1, md: 2 },
        alignItems: { md: "center" },
        px: 2,
        py: 1.5,
        "& + &": { borderTop: 1, borderColor: "divider" },
      }}
    >
      <Chip
        size="small"
        label={t(level === "blocking" ? "blocking" : "followUp")}
        sx={{
          ...levelChip,
          bgcolor: m3(level === "blocking" ? "errorContainer" : "tertiaryContainer"),
          color: m3(level === "blocking" ? "onErrorContainer" : "onTertiaryContainer"),
        }}
      />
      <Typography sx={{ flex: 1 }}>{text}</Typography>
      <MuiLink component={Link} href={href} sx={{ fontWeight: 500 }}>
        {link}
      </MuiLink>
      <Box sx={{ minWidth: { md: "11rem" }, textAlign: { md: "right" } }}>{action}</Box>
    </Stack>
  );
}

/**
 * « Votre liste de tâches » du tableau de bord admin (story H3, écran A1). D'abord les tâches
 * « Bloquant », détectées par l'application, qui disparaissent seules une fois le problème réglé
 * ; puis les tâches « À suivre », cochées à la main (« Marquer comme fait », avec Annuler) ; enfin
 * les tâches terminées, dans une section repliable, avec « Rétablir ».
 */
export function DashboardTasks({
  amapSlug,
  blocking,
  todo,
  done,
}: {
  amapSlug: string;
  blocking: BlockingTask[];
  todo: FollowUpTaskView[];
  done: FollowUpTaskView[];
}) {
  const t = useTranslations("Admin.dashboard");
  const showSnackbar = useSnackbar();
  const [pending, setPending] = useState<string | null>(null);
  const admin = `/${amapSlug}/admin`;

  const blockingText = (task: BlockingTask) =>
    task.kind === "open_reports"
      ? t("openReports", { count: task.count })
      : task.kind === "producer_without_referent"
        ? t("producerWithoutReferent", { name: task.name })
        : t("catalogNotPublished", {
            name: task.name,
            month: day(`${task.month}-01`, "MMMM"),
            opensOn: day(task.opensOn, "d MMMM"),
          });

  const followUpText = (task: FollowUpTaskView) =>
    task.kind === "distribution_closed"
      ? t("distributionClosed", {
          date: day(task.details.date, "EEEE d MMMM"),
          reason: task.details.reason,
        })
      : t("reportFollowUp", {
          date: day(task.details.distributionDate, "EEEE d MMMM"),
          quantity: task.details.quantity,
          product: task.details.product,
          producer: task.details.producer,
        });
  const followUpLink = (task: FollowUpTaskView) =>
    task.kind === "distribution_closed"
      ? { href: `${admin}/planning`, link: t("seeCalendar") }
      : { href: `${admin}/signalements`, link: t("treatReports") };

  const mark = async (task: FollowUpTaskView, isDone: boolean, undoable = true) => {
    setPending(task.id);
    const result = await markTaskDoneAction(amapSlug, { taskId: task.id, done: isDone });
    setPending(null);
    if (result.status !== "saved") {
      showSnackbar({ message: t("markError"), severity: "error" });
      return;
    }
    showSnackbar({
      message: isDone ? t("markedDone") : t("markedTodo"),
      ...(undoable ? { onUndo: () => void mark(task, !isDone, false) } : {}),
    });
  };

  const count = blocking.length + todo.length;
  return (
    <Paper variant="outlined" component="section" aria-labelledby="tasks-title" sx={{ p: 3 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "baseline", gap: 2, mb: 1.5 }}
      >
        <Typography id="tasks-title" variant="h2">
          {t("tasksTitle")}
        </Typography>
        <Typography color="text.secondary">{t("taskCount", { count })}</Typography>
      </Stack>

      {count === 0 ? (
        <Typography>{t("noTask")}</Typography>
      ) : (
        <Box
          component="ul"
          sx={{ m: 0, p: 0, listStyle: "none", border: 1, borderColor: "divider", borderRadius: 3 }}
        >
          {blocking.map((task) => (
            <TaskRow
              key={`${task.kind}-${task.kind === "open_reports" ? "" : `${task.amapProducerId}`}`}
              level="blocking"
              text={blockingText(task)}
              href={
                task.kind === "open_reports"
                  ? `${admin}/signalements`
                  : `${admin}/producteurs/${task.amapProducerId}`
              }
              link={
                task.kind === "open_reports"
                  ? t("treatReports")
                  : task.kind === "producer_without_referent"
                    ? t("assignReferent", { name: task.name })
                    : t("contactReferent", { name: task.name })
              }
              action={
                <Typography variant="bodySmall" color="text.secondary">
                  {t("autoHint")}
                </Typography>
              }
            />
          ))}
          {todo.map((task) => (
            <TaskRow
              key={task.id}
              level="followUp"
              text={followUpText(task)}
              {...followUpLink(task)}
              action={
                <Button
                  variant="outlined"
                  size="small"
                  disabled={pending === task.id}
                  onClick={() => void mark(task, true)}
                >
                  {t("markDone")}
                  <Box component="span" sx={visuallyHidden}>
                    {` : ${followUpText(task)}`}
                  </Box>
                </Button>
              }
            />
          ))}
        </Box>
      )}

      {done.length > 0 && (
        <Box component="details" sx={{ mt: 2 }}>
          <Box
            component="summary"
            sx={{ cursor: "pointer", fontWeight: 500, color: "primary.main", py: 1 }}
          >
            {t("doneTitle", { count: done.length })}
          </Box>
          <Box
            component="ul"
            sx={{
              m: 0,
              p: 0,
              listStyle: "none",
              border: 1,
              borderColor: "divider",
              borderRadius: 3,
            }}
          >
            {done.map((task) => (
              <Stack
                key={task.id}
                component="li"
                direction={{ xs: "column", md: "row" }}
                sx={{
                  gap: { xs: 1, md: 2 },
                  alignItems: { md: "center" },
                  px: 2,
                  py: 1,
                  color: "text.secondary",
                  "& + &": { borderTop: 1, borderColor: "divider" },
                }}
              >
                <CheckOutlined fontSize="small" aria-hidden sx={{ color: "success.main" }} />
                <Typography sx={{ flex: 1, textDecoration: "line-through" }}>
                  {followUpText(task)}
                </Typography>
                <Typography variant="bodySmall">
                  {t("doneBy", {
                    name: task.doneByName ?? "",
                    date: formatDate(task.doneAt!.toISOString(), "d MMMM"),
                  })}
                </Typography>
                <Button
                  size="small"
                  disabled={pending === task.id}
                  onClick={() => void mark(task, false)}
                >
                  {t("restore")}
                  <Box component="span" sx={visuallyHidden}>
                    {` : ${followUpText(task)}`}
                  </Box>
                </Button>
              </Stack>
            ))}
          </Box>
        </Box>
      )}

      <Typography variant="bodySmall" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        {t("legend")}
      </Typography>
    </Paper>
  );
}

/** Carte « Adhésions » du tableau de bord : foyers adhérents, adhésions qui expirent bientôt. */
export function MembershipCard({
  amapSlug,
  progress,
}: {
  amapSlug: string;
  progress: { active: number; expiring: number; total: number };
}) {
  const t = useTranslations("Admin.dashboard");
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="adhesions"
      sx={{ p: 2.5, mb: 3, maxWidth: 360 }}
    >
      <Typography id="adhesions" variant="titleSmall" component="h2" color="text.secondary">
        {t("memberships")}
      </Typography>
      <Typography variant="headlineSmall" component="p" sx={{ my: 0.5 }}>
        {t("membershipsActive", { active: progress.active, total: progress.total })}
      </Typography>
      {progress.expiring > 0 && (
        <Chip
          size="small"
          label={t("membershipsExpiring", { count: progress.expiring })}
          sx={{ bgcolor: m3("tertiaryContainer"), color: m3("onTertiaryContainer"), mb: 1 }}
        />
      )}
      <Box>
        <MuiLink component={Link} href={`/${amapSlug}/admin/foyers`}>
          {t("seeHouseholds")}
        </MuiLink>
      </Box>
    </Paper>
  );
}
