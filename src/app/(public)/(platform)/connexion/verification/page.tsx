import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { safeReturnPath } from "@/domain/return-path";
import { getSecondFactorState } from "@/server/auth/second-factor";
import { SecondFactorChallenge } from "@/ui/auth/SecondFactorChallenge";
import { SecondFactorEnroll } from "@/ui/auth/SecondFactorEnroll";

type Props = { searchParams: Promise<{ retour?: string }> };

// [domaine]/connexion/verification : deuxième vérification des admins et gestionnaires, après
// un lien magique. « retour » : page où revenir ensuite.
export default async function SecondFactorPage({ searchParams }: Props) {
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  const returnTo = safeReturnPath((await searchParams).retour);
  if (state.status === "verified" || state.status === "not_required") redirect(returnTo);

  const t = await getTranslations("Auth.verification");
  const enroll = state.status === "enroll";
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {enroll ? t("enrollTitle") : t("title")}
      </Typography>
      <Typography sx={{ mb: 3 }}>{enroll ? t("enrollIntro") : t("intro")}</Typography>
      {enroll ? (
        <SecondFactorEnroll returnTo={returnTo} />
      ) : (
        <SecondFactorChallenge
          passkey={state.factors.passkeys > 0}
          totp={state.factors.totp}
          returnTo={returnTo}
        />
      )}
    </>
  );
}
