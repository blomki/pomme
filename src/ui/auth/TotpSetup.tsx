"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useTransition } from "react";

import {
  confirmTotpSetupAction,
  startTotpSetupAction,
  type ConfirmTotpState,
  type TotpSetup as TotpSetupData,
} from "@/server/auth/second-factor-actions";

/**
 * Activation de l'application d'authentification, en trois temps : QR code à scanner, codes de
 * secours à noter (affichés une seule fois), puis premier code à saisir.
 */
export function TotpSetup({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Auth.totp");
  const tv = useTranslations("Auth.verification");
  const [setup, setSetup] = useState<TotpSetupData | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState<ConfirmTotpState, FormData>(
    confirmTotpSetupAction,
    { status: "idle" },
  );

  useEffect(() => {
    if (state.status === "confirmed") onDone();
  }, [state.status, onDone]);

  const start = () =>
    startTransition(async () => {
      setSetup(await startTotpSetupAction());
    });

  if (!setup) {
    return (
      <div>
        <Button variant="tonal" onClick={start} disabled={starting}>
          {t("start")}
        </Button>
      </div>
    );
  }

  if (setup.status === "error") {
    return <Alert severity="error">{t("startError")}</Alert>;
  }

  // Premier code juste : Better Auth remplace la session, et la page se recharge côté serveur
  // (redirection, ou section « Activée »). Ce composant disparaît donc souvent avant d'arriver
  // ici : c'est pourquoi les codes de secours sont montrés AVANT la confirmation.
  if (state.status === "confirmed") return null;

  const error =
    state.status === "invalid_format"
      ? tv("invalidFormat")
      : state.status === "wrong_code"
        ? tv("wrongCode")
        : state.status === "rate_limited"
          ? tv("rateLimited")
          : null;

  return (
    <Stack spacing={2}>
      <Typography>{t("scan")}</Typography>
      {/* Image générée par le serveur (data: URI) : next/image n'apporte rien ici. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qrCode} alt={t("qrAlt")} width={200} height={200} />
      <Typography variant="bodyMedium" color="text.secondary">
        {t("manual")}{" "}
        <Typography component="code" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
          {setup.key}
        </Typography>
      </Typography>
      <Stack spacing={1} component="section" aria-labelledby="backup-codes">
        <Typography id="backup-codes" variant="titleMedium" component="h3">
          {t("backupTitle")}
        </Typography>
        <Typography>{t("backupIntro")}</Typography>
        <Typography
          component="ul"
          sx={{ fontFamily: "monospace", fontSize: "1.1rem", columns: 2, pl: 3, m: 0 }}
        >
          {setup.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </Typography>
      </Stack>
      <Typography>{t("enterCode")}</Typography>
      <Stack component="form" action={formAction} spacing={2} noValidate sx={{ maxWidth: 320 }}>
        <TextField
          name="code"
          label={t("codeLabel")}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          error={error !== null}
          helperText={error ?? tv("totpHelp")}
        />
        <div>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("confirm")}
          </Button>
        </div>
      </Stack>
    </Stack>
  );
}
