"use client";

import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useTranslations } from "next-intl";
import Link from "next/link";

/** Lien « Mon compte » des barres du haut : espaces, passkeys, déconnexion. */
export function AccountLink() {
  const t = useTranslations("Nav");
  return (
    <Tooltip title={t("account")}>
      <IconButton component={Link} href="/compte" nativeButton={false} aria-label={t("account")}>
        <AccountCircleOutlined />
      </IconButton>
    </Tooltip>
  );
}
