"use client";

import ArrowBack from "@mui/icons-material/ArrowBack";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * Petite barre d'application de Material Design 3 (*small top app bar*, fiche #126) : bouton de
 * navigation « Retour » à gauche, puis le titre de la page (titre de niveau 1).
 *
 * La flèche est un lien vers une adresse fixe, pas « page précédente » du navigateur : on peut
 * arriver sur la page par un lien direct, et l'historique ferait alors quitter l'application.
 */
export function SmallTopAppBar({ title, backHref }: { title: string; backHref: string }) {
  const t = useTranslations("Nav");
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minHeight: 64 }}>
      <IconButton
        component={Link}
        href={backHref}
        nativeButton={false}
        aria-label={t("back")}
        edge="start"
      >
        <ArrowBack />
      </IconButton>
      <Typography component="h1" variant="titleLarge">
        {title}
      </Typography>
    </Stack>
  );
}
