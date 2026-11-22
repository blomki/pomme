"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";

import { revokeAllDevicesAction, type RevokeState } from "@/server/auth/actions";

/**
 * Confirmation avant de déconnecter tous les appareils (story S10) : un lien d'email n'agit
 * jamais seul, car les messageries ouvrent parfois les liens pour les vérifier.
 */
export function RevokeDevicesForm({ token }: { token: string }) {
  const t = useTranslations("Auth.revoke");
  const [state, formAction, pending] = useActionState<RevokeState, FormData>(
    revokeAllDevicesAction,
    { status: "idle" },
  );
  if (state.status === "done") {
    return (
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Alert severity="success" role="status">
          {t("done", { count: state.count ?? 0 })}
        </Alert>
        <Button component={Link} nativeButton={false} href="/connexion" variant="contained">
          {t("signIn")}
        </Button>
      </Stack>
    );
  }
  return (
    <Stack component="form" action={formAction} spacing={2} sx={{ alignItems: "flex-start" }}>
      <input type="hidden" name="jeton" value={token} />
      {state.status === "invalid" && <Alert severity="error">{t("invalid")}</Alert>}
      <Button type="submit" variant="contained" color="error" disabled={pending}>
        {t("confirm")}
      </Button>
    </Stack>
  );
}
