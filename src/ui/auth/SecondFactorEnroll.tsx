"use client";

import KeyOutlined from "@mui/icons-material/KeyOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "./auth-client";
import { TotpSetup } from "./TotpSetup";

/**
 * Premier moyen de vérification d'un admin ou d'un gestionnaire : passkey (le plus simple) ou
 * application d'authentification. Une fois créé, la session compte comme vérifiée.
 */
export function SecondFactorEnroll({ returnTo }: { returnTo: string }) {
  const t = useTranslations("Auth.verification");
  const router = useRouter();
  const [passkeyError, setPasskeyError] = useState(false);

  const done = () => {
    router.push(returnTo);
    router.refresh();
  };

  const createPasskey = async () => {
    setPasskeyError(false);
    const result = await authClient.passkey.addPasskey();
    if (result?.error) {
      setPasskeyError(true);
      return;
    }
    done();
  };

  return (
    <Stack spacing={4} sx={{ maxWidth: 560 }}>
      <Stack spacing={1} component="section" aria-labelledby="enroll-passkey">
        <Typography id="enroll-passkey" variant="h2">
          {t("enrollPasskey")}
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary">
          {t("enrollPasskeyHelp")}
        </Typography>
        <div>
          <Button variant="contained" startIcon={<KeyOutlined />} onClick={createPasskey}>
            {t("enrollPasskey")}
          </Button>
        </div>
        <div role="status" aria-live="polite">
          {passkeyError && <Alert severity="error">{t("enrollPasskeyError")}</Alert>}
        </div>
      </Stack>

      <Stack spacing={1} component="section" aria-labelledby="enroll-totp">
        <Typography id="enroll-totp" variant="h2">
          {t("enrollTotp")}
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary">
          {t("enrollTotpHelp")}
        </Typography>
        <TotpSetup onDone={done} />
      </Stack>
    </Stack>
  );
}
