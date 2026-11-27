import ArrowBack from "@mui/icons-material/ArrowBack";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { signOutAction } from "@/server/auth/actions";
import { passkeyLastUse } from "@/server/auth/passkey-usage";
import { getSecondFactorState, verificationUrl } from "@/server/auth/second-factor";
import { SignOutEverywhere } from "@/ui/account/SignOutEverywhere";
import { PasskeyManager } from "@/ui/auth/PasskeyManager";
import { TotpSection } from "@/ui/auth/TotpSection";
import { LinkButton } from "@/ui/navigation/LinkButton";

// [domaine]/compte/securite : « Connexion et sécurité » (story A3, écran 9) : passkeys,
// application d'authentification, appareils connectés et déconnexion.
export default async function SecurityPage() {
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  const { user, factors } = state;
  const lastUsed = await passkeyLastUse(user.id);
  const t = await getTranslations("Auth.account");
  return (
    <Stack spacing={4}>
      <div>
        <LinkButton href="/compte" startIcon={<ArrowBack />} sx={{ mb: 1 }}>
          {t("backToProfile")}
        </LinkButton>
        <Typography variant="h1" gutterBottom>
          {t("securityTitle")}
        </Typography>
        <Typography>{t("signedInAs", { email: user.email })}</Typography>
      </div>

      {state.status === "challenge" && (
        <Alert
          severity="info"
          action={
            <LinkButton href={verificationUrl("/compte/securite")} color="inherit" size="small">
              {t("verifyNow")}
            </LinkButton>
          }
        >
          {t("verifyFirst")}
        </Alert>
      )}

      <PasskeyManager lastUsed={lastUsed} />

      {/* L'application ne sert qu'aux comptes soumis à la deuxième vérification. */}
      {(factors.required || factors.totp) && <TotpSection active={factors.totp} />}

      <Divider />

      <Stack component="section" aria-labelledby="appareils" spacing={2}>
        <Typography id="appareils" variant="h2">
          {t("devicesTitle")}
        </Typography>
        <Typography color="text.secondary">{t("devicesHelp")}</Typography>
        <SignOutEverywhere />
        <form action={signOutAction}>
          <Button type="submit" variant="text">
            {t("signOut")}
          </Button>
        </form>
      </Stack>
    </Stack>
  );
}
