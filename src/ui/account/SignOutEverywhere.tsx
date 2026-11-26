"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { signOutEverywhereAction } from "@/server/auth/actions";

/**
 * « Me déconnecter de tous mes appareils », avec confirmation (story A3) : l'appareil courant
 * est déconnecté lui aussi.
 */
export function SignOutEverywhere() {
  const t = useTranslations("Auth.account");
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <div>
        <Button variant="outlined" color="error" onClick={() => setConfirming(true)}>
          {t("signOutEverywhere")}
        </Button>
      </div>
    );
  }
  return (
    <Alert
      severity="warning"
      role="alert"
      action={
        <Stack direction="row" spacing={1}>
          <Button color="inherit" size="small" onClick={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
          <form action={signOutEverywhereAction}>
            <Button type="submit" color="error" variant="contained" size="small">
              {t("signOutEverywhereConfirmButton")}
            </Button>
          </form>
        </Stack>
      }
    >
      {t("signOutEverywhereConfirm")}
    </Alert>
  );
}
