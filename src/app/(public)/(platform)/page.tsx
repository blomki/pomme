"use client";

import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

// Accueil de la plateforme ([domaine]/). Les AMAP ont leur propre page : [domaine]/<adresse-de-l-amap>.
export default function HomePage() {
  const t = useTranslations("Home");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 3 }}>{t("intro")}</Typography>
      <Button component={Link} href="/connexion" nativeButton={false} variant="contained">
        {t("signIn")}
      </Button>
    </>
  );
}
