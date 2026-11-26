"use client";

import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { BANNER_GROUPS, type BannerImages } from "@/domain/banner-images";
import { removeBannerImageAction, saveBannerImageAction } from "@/server/amap-settings-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { ImageUpload } from "../forms/ImageUpload";

/**
 * « Images des bandeaux » des réglages (story S14, ADR 0049) : une image par famille d'écrans
 * (personnage, illustration, simple icône). Sans image, le bandeau montre le logo de l'AMAP.
 * Images décoratives : pas de texte alternatif à saisir.
 */
export function BannerImagesSection({
  amapSlug,
  images,
  storageEnabled,
}: {
  amapSlug: string;
  images: BannerImages;
  storageEnabled: boolean;
}) {
  const t = useTranslations("Admin.bannerImages");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  const id = useId();

  return (
    <Paper variant="outlined" component="section" aria-labelledby={id} sx={{ p: 3 }}>
      <Typography id={id} variant="h2" sx={{ mb: 1 }}>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 3, color: "text.secondary" }}>{t("intro")}</Typography>
      <Stack spacing={4}>
        {BANNER_GROUPS.map((group) => {
          const url = images[group];
          const label = t(`groups.${group}`);
          return (
            <ImageUpload
              key={group}
              heading="h3"
              title={label}
              current={url ? { url, alt: "" } : null}
              fallbackAlt={t("alt", { group: label })}
              enabled={storageEnabled}
              withAlt={false}
              fit="contain"
              onSave={(form) => saveBannerImageAction(amapSlug, group, form)}
              onRemove={() => removeBannerImageAction(amapSlug, group)}
              onSaved={(what) => {
                showSnackbar({
                  message: t(what === "saved" ? "saved" : "removed", { group: label }),
                });
                router.refresh();
              }}
            />
          );
        })}
      </Stack>
    </Paper>
  );
}
