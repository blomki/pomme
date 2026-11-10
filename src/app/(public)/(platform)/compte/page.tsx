import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { signOutAction, signOutEverywhereAction } from "@/server/auth/actions";
import { getSecondFactorState, verificationUrl } from "@/server/auth/second-factor";
import { PasskeyManager } from "@/ui/auth/PasskeyManager";
import { TotpSection } from "@/ui/auth/TotpSection";

// [domaine]/compte : mon compte (passkeys, application d'authentification, déconnexion).
// Le profil complet viendra avec A3.
export default async function AccountPage() {
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  const { user, factors } = state;
  const t = await getTranslations("Auth.account");
  return (
    <Stack spacing={4}>
      <div>
        <Typography variant="h1" gutterBottom>
          {t("title")}
        </Typography>
        <Typography>{t("signedInAs", { email: user.email })}</Typography>
      </div>

      {state.status === "challenge" && (
        <Alert
          severity="info"
          action={
            <Button
              component={Link}
              href={verificationUrl("/compte")}
              nativeButton={false}
              color="inherit"
              size="small"
            >
              {t("verifyNow")}
            </Button>
          }
        >
          {t("verifyFirst")}
        </Alert>
      )}

      <PasskeyManager />

      {/* L'application ne sert qu'aux comptes soumis à la deuxième vérification. */}
      {(factors.required || factors.totp) && <TotpSection active={factors.totp} />}

      <Divider />

      <Stack component="section" aria-labelledby="sessions" spacing={2}>
        <Typography id="sessions" variant="h2">
          {t("sessions")}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <form action={signOutAction}>
            <Button type="submit" variant="outlined">
              {t("signOut")}
            </Button>
          </form>
          <form action={signOutEverywhereAction}>
            <Button type="submit" variant="text" color="error">
              {t("signOutEverywhere")}
            </Button>
          </form>
        </Stack>
      </Stack>
    </Stack>
  );
}
