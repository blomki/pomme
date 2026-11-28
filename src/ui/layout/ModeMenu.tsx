"use client";

import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState } from "react";

import type { AmapSpaceKind } from "@/domain/spaces";
import { setModeAction } from "@/server/my-account-actions";

import { m3 } from "../theme/create-theme";

/**
 * Bouton « Mode » de l'en-tête (stories A3 et S14) : une personne qui est, dans cette AMAP,
 * administratrice, référente ou membre d'un foyer passe d'un mode à l'autre. Le choix est
 * mémorisé sur le compte (`user.preferred_space`, ADR 0045). Affiché seulement à partir de deux
 * modes, dans l'en-tête de tous les espaces d'une AMAP, ou en tête du menu « burger » quand
 * l'espace en a un (fiche #126, ADR 0048).
 */
export function ModeMenu({
  amapSlug,
  current,
  modes,
  fullWidth = false,
}: {
  amapSlug: string;
  current: AmapSpaceKind;
  modes: readonly AmapSpaceKind[];
  /** Dans le menu « burger » : toute la largeur, libellé complet. */
  fullWidth?: boolean;
}) {
  const t = useTranslations("Nav.mode");
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;

  return (
    <>
      <Button
        id={`${id}-button`}
        variant="outlined"
        // Nom complet, même quand le libellé affiché est raccourci (« Admin ») : il contient le
        // texte visible, comme le demande le critère WCAG 2.5.3 (étiquette dans le nom).
        aria-label={t(current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        fullWidth={fullWidth}
        startIcon={
          <Box
            component="span"
            aria-hidden
            sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: m3("secondary") }}
          />
        }
        endIcon={<ExpandMoreOutlined />}
        sx={{
          color: m3("onSurfaceVariant"),
          borderColor: m3("outline"),
          paddingInline: { xs: 1.5, sm: 2 },
          flexShrink: 0,
          // Très petit écran, dans l'en-tête : sans pastille, la place va au nom de l'AMAP.
          ...(!fullWidth && {
            "& .MuiButton-startIcon": { display: { xs: "none", sm: "inherit" } },
          }),
          ...(fullWidth && {
            justifyContent: "flex-start",
            "& .MuiButton-endIcon": { ml: "auto" },
          }),
        }}
      >
        {fullWidth ? (
          t(current)
        ) : (
          <>
            {/* Libellé raccourci sur très petit écran ; un seul des deux est lu (l'autre est masqué). */}
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              {t(current)}
            </Box>
            <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
              {t(`short.${current}`)}
            </Box>
          </>
        )}
      </Button>
      <Menu
        id={`${id}-menu`}
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: fullWidth ? "left" : "right" }}
        transformOrigin={{ vertical: "top", horizontal: fullWidth ? "left" : "right" }}
        slotProps={{
          list: { "aria-labelledby": `${id}-button` },
          paper: { sx: { borderRadius: "16px", mt: 1 } },
        }}
      >
        {modes.map((mode) => (
          <MenuItem
            key={mode}
            component={Link}
            href={`/${amapSlug}/${mode}`}
            selected={mode === current}
            aria-current={mode === current ? "page" : undefined}
            onClick={() => {
              setAnchor(null);
              // Mode mémorisé (story A3) : rouvert après la connexion.
              void setModeAction(`${amapSlug}/${mode}`);
            }}
          >
            <ListItemIcon>{mode === current && <CheckOutlined fontSize="small" />}</ListItemIcon>
            <ListItemText>{t(mode)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
