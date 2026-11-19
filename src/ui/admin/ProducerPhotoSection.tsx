"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import {
  removeProducerPhotoAction,
  saveProducerPhotoAction,
} from "@/server/producer-photos-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { ImageUpload } from "../forms/ImageUpload";

/**
 * Photo du producteur (fiche S11), sur sa fiche côté admin et dans « Mes producteurs » côté
 * référent. La photo est commune à toutes les AMAP du producteur.
 */
export function ProducerPhotoSection({
  amapSlug,
  producer,
  enabled,
}: {
  amapSlug: string;
  producer: { id: string; name: string; photoUrl: string | null; photoAlt: string };
  /** Stockage des fichiers configuré sur ce site. */
  enabled: boolean;
}) {
  const t = useTranslations("ProducerPhoto");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  return (
    <ImageUpload
      // key : repart de la photo enregistrée quand on change de producteur.
      key={producer.id}
      title={t("title")}
      current={producer.photoUrl ? { url: producer.photoUrl, alt: producer.photoAlt } : null}
      fallbackAlt={t("fallbackAlt", { name: producer.name })}
      enabled={enabled}
      onSave={(form) => {
        form.set("amapProducerId", producer.id);
        return saveProducerPhotoAction(amapSlug, form);
      }}
      onRemove={() => removeProducerPhotoAction(amapSlug, producer.id)}
      onSaved={(what) => {
        showSnackbar({ message: t(what, { name: producer.name }) });
        router.refresh();
      }}
    />
  );
}
