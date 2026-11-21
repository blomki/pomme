"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AccountLink } from "../navigation/AccountLink";
import { m3 } from "../theme/create-theme";
import { ColorModeToggle } from "../theme/ColorModeToggle";

/**
 * Gabarit du site public d'une AMAP (story H2) : en-tête avec le logo et le nom (lien vers
 * l'accueil), menu du site (pages cochées « Dans le menu », dans l'ordre), contenu, puis pied de
 * page avec les mentions légales et l'accès à l'espace des membres.
 */
export function PublicSiteShell({
  amap,
  menu,
  legalPath,
  children,
}: {
  amap: { slug: string; name: string; logoUrl: string | null };
  menu: Array<{ title: string; path: string }>;
  legalPath: string | null;
  children: ReactNode;
}) {
  const t = useTranslations("PublicSite");
  const pathname = usePathname();
  const base = `/${amap.slug}`;

  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static" component="header">
        <Toolbar sx={{ gap: 1.5, minHeight: 64, flexWrap: "wrap" }}>
          <Box
            component={Link}
            href={base}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              flex: 1,
              minWidth: 0,
              color: "inherit",
              textDecoration: "none",
            }}
          >
            {amap.logoUrl && (
              // Le nom de l'AMAP suit : le logo est décoratif ici (alt vide).
              <Box
                component="img"
                src={amap.logoUrl}
                alt=""
                sx={{ width: 40, height: 40, objectFit: "contain", borderRadius: 1 }}
              />
            )}
            <Typography component="p" variant="headlineSmall" noWrap>
              {amap.name}
            </Typography>
          </Box>
          <ColorModeToggle />
          <AccountLink />
        </Toolbar>
        {menu.length > 0 && (
          <Box component="nav" aria-label={t("menu")} sx={{ px: 2, pb: 1 }}>
            <Stack
              component="ul"
              direction="row"
              sx={{ m: 0, p: 0, listStyle: "none", gap: 0.5, flexWrap: "wrap" }}
            >
              {menu.map((item) => {
                const href = `${base}${item.path}`;
                const current =
                  pathname === href || (item.path !== "" && pathname.startsWith(`${href}/`));
                return (
                  <li key={item.path}>
                    <MuiLink
                      component={Link}
                      href={href}
                      aria-current={pathname === href ? "page" : undefined}
                      underline="hover"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: 40,
                        px: 1.5,
                        borderRadius: 5,
                        color: "inherit",
                        fontWeight: 500,
                        bgcolor: current ? m3("secondaryContainer") : "transparent",
                        ...(current && { color: m3("onSecondaryContainer") }),
                      }}
                    >
                      {item.title}
                    </MuiLink>
                  </li>
                );
              })}
            </Stack>
          </Box>
        )}
      </AppBar>
      <Box
        component="main"
        id="contenu"
        tabIndex={-1}
        sx={{ flex: 1, width: "100%", maxWidth: 760, mx: "auto", px: 2, py: 4, outline: "none" }}
      >
        {children}
      </Box>
      <Box
        component="footer"
        sx={{
          borderTop: 1,
          borderColor: "divider",
          px: 2,
          py: 3,
          bgcolor: m3("surfaceContainerLow"),
        }}
      >
        <Stack
          direction="row"
          sx={{
            maxWidth: 760,
            mx: "auto",
            gap: 3,
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="bodyMedium">{amap.name}</Typography>
          <Stack direction="row" sx={{ gap: 3, flexWrap: "wrap" }}>
            <MuiLink component={Link} href={`${base}/adherer`}>
              {t("join")}
            </MuiLink>
            {legalPath && (
              <MuiLink component={Link} href={`${base}${legalPath}`}>
                {t("legal")}
              </MuiLink>
            )}
            <MuiLink component={Link} href="/connexion">
              {t("members")}
            </MuiLink>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
