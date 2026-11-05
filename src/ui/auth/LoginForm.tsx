"use client";

import KeyOutlined from "@mui/icons-material/KeyOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { requestMagicLinkAction } from "@/server/auth/actions";
import type { RequestMagicLinkState } from "@/server/auth/request-magic-link";

import { authClient } from "./auth-client";

/** Formulaire de connexion : lien magique par email, ou passkey. */
export function LoginForm({ notice }: { notice?: "linkError" | "signedOut" | "signedOutEverywhere" }) {
  const t = useTranslations("Auth.login");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RequestMagicLinkState, FormData>(
    requestMagicLinkAction,
    { status: "idle" },
  );
  const [passkeyError, setPasskeyError] = useState(false);

  const signInWithPasskey = async () => {
    setPasskeyError(false);
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setPasskeyError(true);
      return;
    }
    router.push("/compte");
    router.refresh();
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      {notice && (
        <Alert severity={notice === "linkError" ? "warning" : "info"}>{t(`notice.${notice}`)}</Alert>
      )}

      <Stack component="form" action={formAction} spacing={2} noValidate>
        <TextField
          name="email"
          type="email"
          label={t("email")}
          autoComplete="email webauthn"
          required
          error={state.status === "invalid"}
          helperText={state.status === "invalid" ? t("invalid") : t("emailHelp")}
        />
        <Button type="submit" variant="contained" disabled={pending}>
          {t("submit")}
        </Button>
        <div role="status" aria-live="polite">
          {state.status === "sent" && <Alert severity="success">{t("sent")}</Alert>}
          {state.status === "rate_limited" && <Alert severity="warning">{t("rateLimited")}</Alert>}
        </div>
      </Stack>

      <Divider>{t("or")}</Divider>

      <Stack spacing={1}>
        <Button variant="tonal" startIcon={<KeyOutlined />} onClick={signInWithPasskey}>
          {t("passkey")}
        </Button>
        <div role="status" aria-live="polite">
          {passkeyError && <Alert severity="error">{t("passkeyError")}</Alert>}
        </div>
      </Stack>
    </Stack>
  );
}
