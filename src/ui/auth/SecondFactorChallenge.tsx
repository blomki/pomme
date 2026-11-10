"use client";

import KeyOutlined from "@mui/icons-material/KeyOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { verifySecondFactorAction } from "@/server/auth/second-factor-actions";
import type { VerifySecondFactorState } from "@/server/auth/verify-second-factor";

import { authClient } from "./auth-client";

/**
 * Deuxième vérification d'un compte qui a déjà un moyen de vérification : passkey, code de
 * l'application, ou code de secours.
 */
export function SecondFactorChallenge({
  passkey,
  totp,
  returnTo,
}: {
  passkey: boolean;
  totp: boolean;
  returnTo: string;
}) {
  const t = useTranslations("Auth.verification");
  const router = useRouter();
  const [passkeyError, setPasskeyError] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  const verifyWithPasskey = async () => {
    setPasskeyError(false);
    // Une connexion par passkey ouvre une nouvelle session, notée comme vérifiée.
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setPasskeyError(true);
      return;
    }
    router.push(returnTo);
    router.refresh();
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      {passkey && (
        <Stack spacing={1}>
          <div>
            <Button variant="contained" startIcon={<KeyOutlined />} onClick={verifyWithPasskey}>
              {t("usePasskey")}
            </Button>
          </div>
          <div role="status" aria-live="polite">
            {passkeyError && <Alert severity="error">{t("passkeyError")}</Alert>}
          </div>
        </Stack>
      )}

      {passkey && totp && <Divider>{t("or")}</Divider>}

      {totp && !useBackup && (
        <>
          <CodeForm method="totp" returnTo={returnTo} />
          <div>
            <Button variant="text" onClick={() => setUseBackup(true)}>
              {t("useBackup")}
            </Button>
          </div>
        </>
      )}
      {totp && useBackup && <CodeForm method="backup" returnTo={returnTo} />}

      <Typography variant="bodyMedium" color="text.secondary">
        {t("lost")}
      </Typography>
    </Stack>
  );
}

function CodeForm({ method, returnTo }: { method: "totp" | "backup"; returnTo: string }) {
  const t = useTranslations("Auth.verification");
  const [state, formAction, pending] = useActionState<VerifySecondFactorState, FormData>(
    verifySecondFactorAction,
    { status: "idle" },
  );
  const error =
    state.status === "invalid_format"
      ? t("invalidFormat")
      : state.status === "wrong_code"
        ? t("wrongCode")
        : state.status === "rate_limited"
          ? t("rateLimited")
          : null;

  return (
    <Stack component="form" action={formAction} spacing={2} noValidate>
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="retour" value={returnTo} />
      <TextField
        name="code"
        label={method === "totp" ? t("totpLabel") : t("backupLabel")}
        inputMode={method === "totp" ? "numeric" : "text"}
        autoComplete="one-time-code"
        required
        error={error !== null}
        helperText={error ?? (method === "totp" ? t("totpHelp") : t("backupHelp"))}
      />
      <div>
        <Button
          type="submit"
          variant={method === "totp" ? "contained" : "tonal"}
          disabled={pending}
        >
          {t("verify")}
        </Button>
      </div>
    </Stack>
  );
}
