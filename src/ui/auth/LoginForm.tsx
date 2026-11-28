"use client";

import KeyOutlined from "@mui/icons-material/KeyOutlined";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { requestMagicLinkAction } from "@/server/auth/actions";
import type { RequestMagicLinkState } from "@/server/auth/request-magic-link";
import type { CaptchaWidgetConfig } from "@/server/captcha";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { Captcha } from "../forms/Captcha";

import { authClient } from "./auth-client";

/** Formulaire de connexion : lien magique par email, ou passkey. */
export function LoginForm({
  notice,
  captcha,
  defaultEmail,
}: {
  notice?: "linkError" | "signedOut" | "signedOutEverywhere";
  /** Clé de site et point d'accès Friendly Captcha ; null si le captcha est désactivé. */
  captcha: CaptchaWidgetConfig | null;
  /** Adresse déjà remplie (lien de l'email d'invitation). */
  defaultEmail?: string;
}) {
  const t = useTranslations("Auth.login");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RequestMagicLinkState, FormData>(
    requestMagicLinkAction,
    { status: "idle" },
  );
  const showSnackbar = useSnackbar();

  // Messages de la page (déconnexion, lien expiré) et du formulaire : tous dans le snackbar,
  // comme les autres messages de l'application (fiche #123).
  useEffect(() => {
    if (notice) {
      showSnackbar({
        message: t(`notice.${notice}`),
        severity: notice === "linkError" ? "warning" : "info",
      });
    }
  }, [notice, showSnackbar, t]);

  useEffect(() => {
    if (state.status === "sent") {
      showSnackbar({ message: t("sent"), severity: "success", persist: true });
    } else if (state.status === "rate_limited" || state.status === "captcha") {
      showSnackbar({
        message: t(state.status === "captcha" ? "captcha" : "rateLimited"),
        severity: "warning",
      });
    }
  }, [state, showSnackbar, t]);

  const signInWithPasskey = async () => {
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      showSnackbar({ message: t("passkeyError"), severity: "error" });
      return;
    }
    router.push("/connexion/suite");
    router.refresh();
  };

  return (
    <Stack spacing={3}>
      <Stack component="form" action={formAction} spacing={2} noValidate>
        <TextField
          name="email"
          type="email"
          label={t("email")}
          autoComplete="email webauthn"
          defaultValue={defaultEmail}
          required
          error={state.status === "invalid"}
          helperText={state.status === "invalid" ? t("invalid") : t("emailHelp")}
        />
        <Captcha sitekey={captcha?.sitekey ?? null} endpoint={captcha?.endpoint} resetKey={state} />
        <Button type="submit" variant="contained" disabled={pending}>
          {t("submit")}
        </Button>
      </Stack>

      <Divider>{t("or")}</Divider>

      <Stack spacing={1}>
        <Button variant="tonal" startIcon={<KeyOutlined />} onClick={signInWithPasskey}>
          {t("passkey")}
        </Button>
      </Stack>
    </Stack>
  );
}
