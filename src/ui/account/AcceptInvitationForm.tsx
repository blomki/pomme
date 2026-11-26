"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";

import { acceptInvitationAction, type AcceptState } from "@/server/my-account-actions";

/**
 * « Rejoindre le foyer » (story A3) : un clic est nécessaire (les messageries ouvrent parfois les
 * liens pour les vérifier) ; le prénom est demandé si le compte n'en a pas encore.
 */
export function AcceptInvitationForm({
  token,
  email,
  needsName,
}: {
  token: string;
  email: string;
  needsName: boolean;
}) {
  const t = useTranslations("Auth.invitation");
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(
    acceptInvitationAction,
    { status: "idle" },
  );
  if (state.status === "accepted") {
    return (
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Alert severity="success" role="status">
          {t("joined", { email })}
        </Alert>
        <Button
          component={Link}
          nativeButton={false}
          href={`/connexion?email=${encodeURIComponent(email)}`}
          variant="contained"
        >
          {t("signIn")}
        </Button>
      </Stack>
    );
  }
  return (
    <Stack component="form" action={formAction} spacing={2} sx={{ maxWidth: 480 }}>
      <input type="hidden" name="jeton" value={token} />
      {needsName && (
        <>
          <Stack direction="row" spacing={1.5}>
            <TextField
              id="invitation-prenom"
              name="firstName"
              label={t("firstName")}
              autoComplete="given-name"
              required
              fullWidth
            />
            <TextField
              id="invitation-nom"
              name="lastName"
              label={t("lastName")}
              autoComplete="family-name"
              fullWidth
            />
          </Stack>
          <Typography variant="bodySmall" color="text.secondary">
            {t("nameHelp")}
          </Typography>
        </>
      )}
      <div role="status" aria-live="polite">
        {state.status !== "idle" && <Alert severity="error">{t(state.status)}</Alert>}
      </div>
      <div>
        <Button type="submit" variant="contained" disabled={pending}>
          {t("join")}
        </Button>
      </div>
    </Stack>
  );
}
