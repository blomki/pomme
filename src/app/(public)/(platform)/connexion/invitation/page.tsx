import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { invitationSessionCase } from "@/domain/household-invitations";
import { signOutForInvitationAction } from "@/server/auth/actions";
import { getCurrentSession } from "@/server/auth/session";
import { getInvitationDetails } from "@/server/my-account";
import { AcceptInvitationForm } from "@/ui/account/AcceptInvitationForm";

type Props = { searchParams: Promise<{ jeton?: string }> };

// [domaine]/connexion/invitation?jeton=… : « Rejoindre le foyer » (story A3, ADR 0045). Le lien
// arrive dans la boîte mail de la personne invitée : pas besoin d'être connecté.
// Session d'un autre compte ouverte dans ce navigateur (fiche #134) : on le dit, et on propose
// de la fermer avant d'accepter.
export default async function InvitationPage({ searchParams }: Props) {
  const { jeton = "" } = await searchParams;
  const [details, session] = await Promise.all([
    getInvitationDetails(getDatabase(), jeton),
    getCurrentSession(),
  ]);
  const t = await getTranslations("Auth.invitation");
  if (details.status !== "pending") {
    return (
      <>
        <Typography variant="h1" gutterBottom>
          {t("title", { household: "" }).trim()}
        </Typography>
        <Typography>{t(details.status)}</Typography>
      </>
    );
  }
  const sessionCase = invitationSessionCase(session?.user.email, details.email);
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title", { household: details.householdName })}
      </Typography>
      {sessionCase === "other" ? (
        <Stack spacing={2} sx={{ maxWidth: 640, alignItems: "flex-start" }}>
          <Alert severity="warning">
            {t("otherSession", {
              name: session!.user.name || session!.user.email,
              email: details.email,
            })}
          </Alert>
          <form action={signOutForInvitationAction}>
            <input type="hidden" name="jeton" value={jeton} />
            <Button type="submit" variant="contained">
              {t("continueAs", { email: details.email })}
            </Button>
          </form>
        </Stack>
      ) : (
        <>
          <Typography sx={{ mb: 3, maxWidth: 640 }}>
            {t("intro", {
              household: details.householdName,
              amap: details.amapName,
              email: details.email,
            })}
          </Typography>
          <AcceptInvitationForm
            token={jeton}
            email={details.email}
            household={details.householdName}
            needsName={details.needsName}
            signedInAsInvitee={sessionCase === "invitee"}
          />
        </>
      )}
    </>
  );
}
