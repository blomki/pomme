"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { ACCEPTED_IMAGE_TYPES, MAX_ALT_LENGTH, MAX_UPLOAD_BYTES } from "@/domain/images";

import { m3 } from "../theme/create-theme";

/** Réponse du serveur, commune aux envois d'image (photo du producteur, logo, produit). */
export type ImageSaveResult =
  | { status: "saved"; photoUrl: string; photoAlt: string }
  | {
      status:
        | "empty"
        | "too_large"
        | "not_image"
        | "no_file"
        | "invalid_alt"
        | "unavailable"
        | "forbidden";
    };

/**
 * Envoi d'une image (fiche S11) : champ fichier natif (clavier, lecteurs d'écran), aperçu avant
 * l'envoi, texte alternatif, puis enregistrement. Les contrôles faits ici (format, taille) ne
 * servent qu'à prévenir plus tôt : le serveur les refait tous et ré-encode l'image.
 */
export function ImageUpload({
  title,
  current,
  fallbackAlt,
  enabled,
  onSave,
  onRemove,
  onSaved,
}: {
  /** Titre de la section (« Photo »). */
  title: string;
  /** Image enregistrée, ou null. */
  current: { url: string; alt: string } | null;
  /** Texte alternatif affiché si aucun n'est saisi (« Photo de la Ferme du Coteau »). */
  fallbackAlt: string;
  /** Stockage configuré : sinon, envoi désactivé avec une explication. */
  enabled: boolean;
  onSave: (form: FormData) => Promise<ImageSaveResult>;
  onRemove: () => Promise<{ status: "removed" | "forbidden" }>;
  /** Après un enregistrement ou un retrait (relire la page, afficher un message). */
  onSaved: (message: "saved" | "removed") => void;
}) {
  const t = useTranslations("ImageUpload");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(current);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState(current?.alt ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // L'aperçu est une adresse « blob: » locale, à libérer quand on n'en a plus besoin.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const fail = (message: string) => {
    setProblem(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  const choose = (file: File | undefined) => {
    setProblem(null);
    setPreview(null);
    if (!file) return;
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      if (fileRef.current) fileRef.current.value = "";
      return fail(t("errors.not_image"));
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      if (fileRef.current) fileRef.current.value = "";
      return fail(t("errors.too_large"));
    }
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const result = await onSave(form);
      if (result.status !== "saved") return fail(t(`errors.${result.status}`));
      setSaved({ url: result.photoUrl, alt: result.photoAlt });
      setAlt(result.photoAlt);
      setPreview(null);
      setProblem(null);
      if (fileRef.current) fileRef.current.value = "";
      onSaved("saved");
    } catch {
      fail(t("errors.network"));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await onRemove();
      if (result.status !== "removed") return fail(t("errors.forbidden"));
      setSaved(null);
      setAlt("");
      setProblem(null);
      onSaved("removed");
    } catch {
      fail(t("errors.network"));
    } finally {
      setPending(false);
    }
  };

  const shown = preview ?? saved?.url ?? null;
  const fileId = `${id}-fichier`;
  const altId = `${id}-alt`;

  return (
    <Box component="section" aria-labelledby={`${id}-titre`}>
      <Typography id={`${id}-titre`} variant="h2" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {!enabled && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("unavailable")}
        </Alert>
      )}
      <Stack
        component="form"
        onSubmit={(e) => void submit(e)}
        noValidate
        direction={{ xs: "column", sm: "row" }}
        spacing={3}
        sx={{ alignItems: "flex-start" }}
      >
        <Box
          sx={{
            width: 200,
            height: 150,
            flexShrink: 0,
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: m3("surfaceContainerHigh"),
            display: "grid",
            placeItems: "center",
          }}
        >
          {shown ? (
            <Box
              component="img"
              src={shown}
              // Pendant l'aperçu, le texte saisi décrit déjà la nouvelle image.
              alt={alt.trim() || fallbackAlt}
              sx={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Typography variant="bodyMedium" sx={{ color: "text.secondary", p: 2 }}>
              {t("none")}
            </Typography>
          )}
        </Box>

        <Stack spacing={2} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
          <Box ref={errorRef} tabIndex={-1}>
            {problem && <Alert severity="error">{problem}</Alert>}
          </Box>
          <Box>
            <FormLabel htmlFor={fileId} sx={{ display: "block", mb: 0.5, color: "text.primary" }}>
              {saved ? t("replace") : t("choose")}
            </FormLabel>
            <Box
              component="input"
              ref={fileRef}
              id={fileId}
              name="photo"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              disabled={!enabled || pending}
              aria-describedby={`${fileId}-aide`}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => choose(e.target.files?.[0])}
              sx={{
                font: "inherit",
                maxWidth: "100%",
                "&:focus-visible": { outline: 2, outlineStyle: "solid", outlineOffset: 2 },
              }}
            />
            <FormHelperText id={`${fileId}-aide`}>{t("help")}</FormHelperText>
          </Box>
          <TextField
            id={altId}
            name="alt"
            label={t("alt")}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            disabled={!enabled || pending}
            helperText={t("altHelp", { fallback: fallbackAlt })}
            slotProps={{ htmlInput: { maxLength: MAX_ALT_LENGTH } }}
          />
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Button type="submit" variant="contained" disabled={!enabled || pending}>
              {pending ? t("saving") : t("save")}
            </Button>
            {saved && (
              <Button
                variant="outlined"
                color="error"
                disabled={!enabled || pending}
                onClick={() => void remove()}
              >
                {t("remove")}
              </Button>
            )}
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}
