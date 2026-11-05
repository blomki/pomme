"use client";

import KeyOutlined from "@mui/icons-material/KeyOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "./auth-client";

/** Après la première connexion : proposer d'enregistrer une passkey sur cet appareil. */
export function PasskeyOffer() {
  const t = useTranslations("Auth.welcome");
  const router = useRouter();
  const [error, setError] = useState(false);

  const createPasskey = async () => {
    setError(false);
    const result = await authClient.passkey.addPasskey();
    if (result?.error) {
      setError(true);
      return;
    }
    router.push("/compte?passkey=ajoutee");
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 480 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button variant="contained" startIcon={<KeyOutlined />} onClick={createPasskey}>
          {t("create")}
        </Button>
        <Button component={Link} href="/compte" nativeButton={false} variant="text">
          {t("later")}
        </Button>
      </Stack>
      <div role="status" aria-live="polite">
        {error && <Alert severity="error">{t("error")}</Alert>}
      </div>
    </Stack>
  );
}
