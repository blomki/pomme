"use client";

import Chip from "@mui/material/Chip";
import { useTranslations } from "next-intl";

import type { MembershipStatus } from "@/domain/memberships";

import { m3 } from "../theme/create-theme";

// Couleurs des rôles M3 du thème de l'AMAP (contraste garanti, en clair comme en sombre) :
// conteneur et texte associé. « Aucune » : simple contour.
const ROLES = {
  active: ["primaryContainer", "onPrimaryContainer"],
  expiring: ["tertiaryContainer", "onTertiaryContainer"],
  upcoming: ["secondaryContainer", "onSecondaryContainer"],
  expired: ["errorContainer", "onErrorContainer"],
} as const;

/** Statut d'adhésion d'un foyer (story B1) : texte et couleur, jamais la couleur seule. */
export function MembershipStatusChip({ status }: { status: MembershipStatus }) {
  const t = useTranslations("Admin.memberships.status");
  if (status === "none") return <Chip size="small" variant="outlined" label={t(status)} />;
  const [background, text] = ROLES[status];
  return <Chip size="small" label={t(status)} sx={{ bgcolor: m3(background), color: m3(text) }} />;
}
