"use client";

import Chip from "@mui/material/Chip";
import { useTranslations } from "next-intl";

import type { ReportStatus } from "@/domain/reports";

import { m3 } from "../theme/create-theme";
import type { M3Role } from "../theme/m3-colors";

const ROLES: Record<ReportStatus, [M3Role, M3Role]> = {
  open: ["tertiaryContainer", "onTertiaryContainer"],
  credited: ["secondaryContainer", "onSecondaryContainer"],
  rejected: ["surfaceContainerHighest", "onSurfaceVariant"],
};

/** Statut d'un signalement (story F5) : en attente, avoir accordé, rejeté. */
export function ReportStatusChip({ status }: { status: ReportStatus }) {
  const t = useTranslations("Reports.status");
  const [background, text] = ROLES[status];
  return <Chip size="small" label={t(status)} sx={{ bgcolor: m3(background), color: m3(text) }} />;
}
