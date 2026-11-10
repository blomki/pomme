"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { disableTotpAction } from "@/server/auth/second-factor-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { TotpSetup } from "./TotpSetup";

/** « Mon compte » : activer ou désactiver l'application d'authentification. */
export function TotpSection({ active }: { active: boolean }) {
  const t = useTranslations("Auth.account");
  const router = useRouter();
  const showSnackbar = useSnackbar();

  return (
    <Stack spacing={1} component="section" aria-labelledby="totp">
      <Typography id="totp" variant="h2">
        {t("totpTitle")}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        {t("totpHelp")}
      </Typography>
      {active ? (
        <>
          <Typography>{t("totpActive")}</Typography>
          <form action={disableTotpAction}>
            <Button type="submit" variant="outlined">
              {t("totpDisable")}
            </Button>
          </form>
        </>
      ) : (
        <TotpSetup
          onDone={() => {
            showSnackbar({ message: t("totpEnabled") });
            router.refresh();
          }}
        />
      )}
    </Stack>
  );
}
