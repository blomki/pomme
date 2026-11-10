"use client";

import AgricultureOutlined from "@mui/icons-material/AgricultureOutlined";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { ColorModeToggle } from "../theme/ColorModeToggle";

import { activeHref } from "./active-href";

const DRAWER_WIDTH = 288;

type NavItem = {
  key: string;
  icon: ReactElement;
  /** Absent : écran pas encore développé, affiché comme « à venir ». */
  href?: string;
};

export type DesktopArea = "admin" | "referent" | "platform";

function navItems(area: DesktopArea, amapSlug?: string): NavItem[] {
  const base = `/${amapSlug}`;
  switch (area) {
    case "admin":
      return [
        { key: "dashboard", icon: <DashboardOutlined />, href: `${base}/admin` },
        { key: "reports", icon: <ReportProblemOutlined /> },
        { key: "planning", icon: <CalendarMonthOutlined /> },
        { key: "producers", icon: <AgricultureOutlined /> },
        { key: "households", icon: <GroupsOutlined /> },
        { key: "members", icon: <BadgeOutlined />, href: `${base}/admin/membres` },
        { key: "pages", icon: <ArticleOutlined /> },
      ];
    case "referent":
      return [
        { key: "dashboard", icon: <DashboardOutlined />, href: `${base}/referent` },
        { key: "cheques", icon: <FactCheckOutlined /> },
        { key: "credits", icon: <UndoOutlined /> },
        { key: "orders", icon: <ReceiptLongOutlined /> },
        { key: "catalogues", icon: <Inventory2Outlined /> },
      ];
    case "platform":
      return [
        { key: "dashboard", icon: <DashboardOutlined />, href: "/plateforme" },
        { key: "themeDemo", icon: <PaletteOutlined />, href: "/plateforme/theme/hommesdeterre" },
      ];
  }
}

/**
 * Gabarit ordinateur (référents, administrateurs, gestion de la plateforme) : menu latéral
 * permanent, barre du haut avec le nom de l'AMAP, le sélecteur d'espace (administration ou
 * référent) et le choix du mode d'affichage.
 */
export function DesktopShell({
  title,
  area,
  amapSlug,
  children,
}: {
  title: string;
  area: DesktopArea;
  amapSlug?: string;
  children: ReactNode;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const items = navItems(area, amapSlug);
  const active = activeHref(
    pathname,
    items.flatMap((item) => (item.href ? [item.href] : [])),
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh" }}>
      <Drawer
        variant="permanent"
        sx={{ width: DRAWER_WIDTH, flexShrink: 0, "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }}
      >
        <Toolbar sx={{ minHeight: 64 }}>
          <Typography component="p" variant="headlineSmall" noWrap>
            {title}
          </Typography>
        </Toolbar>
        <Box component="nav" aria-label={t(`${area}.label`)} sx={{ px: 1.5 }}>
          <List>
            {items.map((item) => (
              <ListItem key={item.key} disablePadding sx={{ mb: 0.5 }}>
                {item.href ? (
                  <ListItemButton
                    component={Link}
                    href={item.href}
                    nativeButton={false}
                    selected={active === item.href}
                    aria-current={active === item.href ? "page" : undefined}
                  >
                    <ListItemIcon sx={{ color: "inherit" }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={t(`${area}.${item.key}`)} />
                  </ListItemButton>
                ) : (
                  <ListItemButton disabled>
                    <ListItemIcon sx={{ color: "inherit" }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={t(`${area}.${item.key}`)} secondary={t("comingSoon")} />
                  </ListItemButton>
                )}
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppBar position="sticky" component="header">
          <Toolbar sx={{ gap: 2, minHeight: 64 }}>
            <Box sx={{ flex: 1 }} />
            {amapSlug && area !== "platform" && <AreaSwitch amapSlug={amapSlug} area={area} />}
            <ColorModeToggle />
          </Toolbar>
        </AppBar>
        <Box
          component="main"
          id="contenu"
          tabIndex={-1}
          sx={{ flex: 1, px: 4, py: 3, maxWidth: 1200, width: "100%", outline: "none" }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Sélecteur d'espace : une personne à la fois administratrice et référente passe de l'un à
 * l'autre. (Il ne s'affichera qu'à ceux qui ont les deux rôles, une fois les comptes en place.)
 */
function AreaSwitch({ amapSlug, area }: { amapSlug: string; area: "admin" | "referent" }) {
  const t = useTranslations("Nav.areaSwitch");
  const areas = [
    { value: "admin", href: `/${amapSlug}/admin` },
    { value: "referent", href: `/${amapSlug}/referent` },
  ] as const;
  return (
    <Stack component="nav" direction="row" spacing={1} aria-label={t("label")}>
      {areas.map((item) => (
        <Button
          key={item.value}
          component={Link}
          href={item.href}
          nativeButton={false}
          variant={item.value === area ? "tonal" : "text"}
          aria-current={item.value === area ? "page" : undefined}
        >
          {t(item.value)}
        </Button>
      ))}
    </Stack>
  );
}
