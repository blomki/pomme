"use client";

import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { notifyPendingAction } from "@/server/duty-planning-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";

/** Bandeau « Changements enregistrés sans prévenir » et « Prévenir maintenant » (story G2). */
export function PendingNotice({
  amapSlug,
  planId,
  names,
}: {
  amapSlug: string;
  planId: string;
  names: string[];
}) {
  const t = useTranslations("Admin.dutyPlanning");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const notify = () =>
    startTransition(async () => {
      const result = await notifyPendingAction(amapSlug, planId);
      showSnackbar({
        message:
          result.status === "sent" ? t("notified", { count: result.counts.sent }) : t("error"),
      });
      router.refresh();
    });
  return (
    <Paper
      role="status"
      elevation={0}
      sx={{
        p: 2,
        bgcolor: m3("tertiaryContainer"),
        color: m3("onTertiaryContainer"),
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
      }}
    >
      <Typography>{t("pending", { names: names.join(", ") })}</Typography>
      <Button variant="contained" onClick={notify} disabled={pending}>
        {t("notifyNow")}
      </Button>
    </Paper>
  );
}
