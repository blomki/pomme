"use client";

import Checklist from "@mui/icons-material/Checklist";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Paper from "@mui/material/Paper";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeHref } from "./active-href";

const ITEMS = [
  { href: "/producteur", key: "home", icon: <HomeOutlined /> },
  { href: "/producteur/catalogue", key: "catalogue", icon: <Inventory2Outlined /> },
  { href: "/producteur/a-preparer", key: "toPrepare", icon: <Checklist /> },
  { href: "/producteur/paiements", key: "payments", icon: <PaymentsOutlined /> },
] as const;

/** Barre du bas de l'espace producteur : Accueil, Catalogue, À préparer, Paiements. */
export function ProducerBottomNavigation() {
  const t = useTranslations("Nav.producer");
  const pathname = usePathname();
  const active = activeHref(
    pathname,
    ITEMS.map((item) => item.href),
  );
  return (
    <Paper
      component="nav"
      aria-label={t("label")}
      square
      sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: "appBar" }}
    >
      <BottomNavigation showLabels value={active}>
        {ITEMS.map((item) => (
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
