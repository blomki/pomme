"use client";

import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Paper from "@mui/material/Paper";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeHref } from "./active-href";

/** Barre du bas de l'espace famille (écran 1) : Accueil, Chèques, Profil. */
export function FamilyBottomNavigation({ amapSlug }: { amapSlug: string }) {
  const t = useTranslations("Nav.family");
  const pathname = usePathname();
  const items = [
    { href: `/${amapSlug}/famille`, key: "home", icon: <HomeOutlined /> },
    { href: `/${amapSlug}/famille/cheques`, key: "cheques", icon: <ReceiptLongOutlined /> },
    { href: "/compte", key: "profile", icon: <AccountCircleOutlined /> },
  ] as const;
  const active = activeHref(
    pathname,
    items.map((item) => item.href),
  );
  return (
    <Paper
      component="nav"
      aria-label={t("label")}
      square
      sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: "appBar" }}
    >
      <BottomNavigation showLabels value={active}>
        {items.map((item) => (
          <BottomNavigationAction
            key={item.href}
            value={item.href}
            label={t(item.key)}
            icon={item.icon}
            component={Link}
            href={item.href}
            nativeButton={false}
            aria-current={active === item.href ? "page" : undefined}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
