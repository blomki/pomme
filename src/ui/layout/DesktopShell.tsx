"use client";

import AgricultureOutlined from "@mui/icons-material/AgricultureOutlined";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import MailOutlined from "@mui/icons-material/MailOutlined";
import ManageAccountsOutlined from "@mui/icons-material/ManageAccountsOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import MenuOutlined from "@mui/icons-material/MenuOutlined";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactElement, type ReactNode } from "react";

import type { AmapSpaceKind } from "@/domain/spaces";
import type { AmapSummary } from "@/server/amap-summary";

import { AccountLink } from "../navigation/AccountLink";
import { m3 } from "../theme/create-theme";

import { activeHref } from "./active-href";
import { ModeMenu } from "./ModeMenu";
import { BannerImageContext, NO_BANNER, type BannerSource } from "./PageBanner";

const DRAWER_WIDTH = 256;

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
        { key: "reports", icon: <ReportProblemOutlined />, href: `${base}/admin/signalements` },
        { key: "planning", icon: <CalendarMonthOutlined />, href: `${base}/admin/planning` },
        { key: "producers", icon: <AgricultureOutlined />, href: `${base}/admin/producteurs` },
        { key: "households", icon: <GroupsOutlined />, href: `${base}/admin/foyers` },
        { key: "emails", icon: <MailOutlined />, href: `${base}/admin/emails` },
        { key: "cheques", icon: <FactCheckOutlined />, href: `${base}/admin/cheques` },
        { key: "pages", icon: <ArticleOutlined />, href: `${base}/admin/pages` },
        { key: "settings", icon: <SettingsOutlined />, href: `${base}/admin/reglages` },
      ];
    case "referent":
      return [
        { key: "dashboard", icon: <DashboardOutlined />, href: `${base}/referent` },
        { key: "producers", icon: <AgricultureOutlined />, href: `${base}/referent/producteurs` },
        { key: "cheques", icon: <FactCheckOutlined />, href: `${base}/referent/cheques` },
        { key: "credits", icon: <UndoOutlined />, href: `${base}/referent/avoirs` },
        { key: "orders", icon: <ReceiptLongOutlined />, href: `${base}/referent/bons-de-commande` },
        { key: "catalogues", icon: <Inventory2Outlined />, href: `${base}/referent/catalogue` },
      ];
    case "platform":
      return [
        { key: "dashboard", icon: <DashboardOutlined />, href: "/plateforme" },
        { key: "accounts", icon: <ManageAccountsOutlined />, href: "/plateforme/comptes" },
        { key: "themeDemo", icon: <PaletteOutlined />, href: "/plateforme/theme/hommesdeterre" },
      ];
  }
}

/**
 * Gabarit des espaces de travail (référents, administrateurs, gestion de la plateforme), charte du
 * 2026-11-26 (story S14). À partir de 1 024 px (`lg`), le menu est une colonne fixe à gauche ;
 * en dessous, il se replie derrière un bouton menu et glisse depuis la gauche, au-dessus d'un
 * voile. Le tiroir de MUI garde le focus à l'intérieur, se ferme avec Échap et rend le focus au
 * bouton. En-tête collant : bouton menu et nom de l'AMAP à gauche ; mode (sur ordinateur ; en
 * tête du menu sinon), prénom et compte à droite. L'apparence se choisit dans « Mon profil »
 * (fiche #127).
 */
export function DesktopShell({
  title,
  area,
  amapSlug,
  modes = [],
  firstName,
  summary,
  banner = NO_BANNER,
  children,
}: {
  title: string;
  area: DesktopArea;
  amapSlug?: string;
  /** Modes de cette AMAP auxquels le compte a accès ; le bouton « Mode » apparaît à partir de deux. */
  modes?: readonly AmapSpaceKind[];
  /** Prénom affiché dans l'en-tête, à partir de 600 px. */
  firstName?: string;
  /** Carte de l'AMAP sous le menu : foyers actifs et producteurs. */
  summary?: AmapSummary;
  /** Images des bandeaux de page : par famille d'écrans, et le logo de l'AMAP par défaut. */
  banner?: BannerSource;
  children: ReactNode;
}) {
  const t = useTranslations("Nav");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppBar
        position="sticky"
        component="header"
        sx={{ bgcolor: m3("surface"), borderBottom: 1, borderColor: m3("outlineVariant") }}
      >
        <Toolbar sx={{ gap: { xs: 1, sm: 2 }, minHeight: { xs: 64, sm: 64 } }}>
          <IconButton
            edge="start"
            aria-label={menuOpen ? t("menuClose") : t("menuOpen")}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            sx={{ display: { lg: "none" } }}
          >
            {menuOpen ? <CloseOutlined /> : <MenuOutlined />}
          </IconButton>
          <Typography component="p" variant="titleLarge" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {title}
          </Typography>
          {/* Ordinateur : bouton « Mode » dans l'en-tête ; en dessous de 1 024 px, il est en tête
              du menu « burger » (fiche #126), ce qui laisse la place au nom de l'AMAP. */}
          {amapSlug && area !== "platform" && modes.length > 1 && (
            <Box sx={{ display: { xs: "none", lg: "block" } }}>
              <ModeMenu amapSlug={amapSlug} current={area} modes={modes} />
            </Box>
          )}
          {firstName && (
            <Typography
              component="span"
              variant="bodyMedium"
              sx={{ color: m3("onSurfaceVariant"), display: { xs: "none", sm: "inline" } }}
            >
              {firstName}
            </Typography>
          )}
          <AccountLink />
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: "flex", minWidth: 0 }}>
        {/* Ordinateur : colonne fixe, collée sous l'en-tête. */}
        <Box
          component="aside"
          sx={{
            display: { xs: "none", lg: "block" },
            width: DRAWER_WIDTH,
            flexShrink: 0,
            position: "sticky",
            top: 64,
            alignSelf: "flex-start",
            height: "calc(100dvh - 64px)",
            overflowY: "auto",
            borderRight: 1,
            borderColor: m3("outlineVariant"),
            bgcolor: m3("surface"),
          }}
        >
          <NavPanel area={area} amapSlug={amapSlug} title={title} summary={summary} />
        </Box>

        {/* Téléphone et tablette : tiroir au-dessus d'un voile, fermé par le voile ou une entrée. */}
        <Drawer
          variant="temporary"
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          transitionDuration={200}
          sx={{ display: { lg: "none" } }}
          slotProps={{
            paper: {
              id: menuId,
              sx: { width: DRAWER_WIDTH, maxWidth: "85vw", bgcolor: m3("surface") },
            },
          }}
        >
          <NavPanel
            area={area}
            amapSlug={amapSlug}
            title={title}
            summary={summary}
            onNavigate={() => setMenuOpen(false)}
            modeMenu={
              amapSlug && area !== "platform" && modes.length > 1 ? (
                <ModeMenu amapSlug={amapSlug} current={area} modes={modes} fullWidth />
              ) : undefined
            }
          />
        </Drawer>

        <Box
          component="main"
          id="contenu"
          tabIndex={-1}
          sx={{
            flex: 1,
            minWidth: 0,
            px: { xs: 2, sm: 4, lg: 5 },
            py: 3,
            outline: "none",
          }}
        >
          <Box sx={{ maxWidth: 1150, mx: "auto" }}>
            <BannerImageContext.Provider value={banner}>{children}</BannerImageContext.Provider>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Contenu du menu : entrées en pilule (l'entrée active porte un point de la couleur secondaire
 * et `aria-current`), puis la carte de l'AMAP.
 */
function NavPanel({
  area,
  amapSlug,
  title,
  summary,
  onNavigate,
  modeMenu,
}: {
  area: DesktopArea;
  amapSlug?: string;
  title: string;
  summary?: AmapSummary;
  onNavigate?: () => void;
  /** Menu « burger » : sélecteur de mode, en tête des entrées (fiche #126). */
  modeMenu?: ReactNode;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const items = navItems(area, amapSlug);
  const active = activeHref(
    pathname,
    items.flatMap((item) => (item.href ? [item.href] : [])),
  );

  return (
    <Box sx={{ px: 1.5, py: 2 }}>
      {modeMenu && <Box sx={{ mb: 2 }}>{modeMenu}</Box>}
      <Box component="nav" aria-label={t(`${area}.label`)}>
        <List disablePadding>
          {items.map((item) => {
            const current = active === item.href;
            return (
              <ListItem key={item.key} disablePadding sx={{ mb: 0.5 }}>
                {item.href ? (
                  <ListItemButton
                    component={Link}
                    href={item.href}
                    nativeButton={false}
                    selected={current}
                    aria-current={current ? "page" : undefined}
                    onClick={onNavigate}
                    sx={{
                      minHeight: 48,
                      color: m3("onSurfaceVariant"),
                      "&:hover": { bgcolor: m3("surfaceContainerLow") },
                      "&.Mui-selected": { fontWeight: 700 },
                    }}
                  >
                    <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={t(`${area}.${item.key}`)}
                      slotProps={{
                        primary: { variant: "bodyMedium", sx: { fontWeight: "inherit" } },
                      }}
                    />
                    {current && (
                      <Box
                        component="span"
                        aria-hidden
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: m3("secondary"),
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </ListItemButton>
                ) : (
                  <ListItemButton disabled sx={{ minHeight: 48 }}>
                    <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={t(`${area}.${item.key}`)} secondary={t("comingSoon")} />
                  </ListItemButton>
                )}
              </ListItem>
            );
          })}
        </List>
      </Box>
      {summary && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: "16px",
            bgcolor: m3("surfaceContainerLow"),
            border: 1,
            borderColor: m3("outlineVariant"),
          }}
        >
          <Typography variant="titleSmall" component="p">
            {title}
          </Typography>
          <Typography variant="bodySmall" component="p" sx={{ color: m3("onSurfaceVariant") }}>
            {t("amapCard", summary)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
