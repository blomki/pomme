import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { getDatabase } from "@/db/client";
import { getInvitationDetails } from "@/server/my-account";
import { AcceptInvitationForm } from "@/ui/account/AcceptInvitationForm";

type Props = { searchParams: Promise<{ jeton?: string }> };

// [domaine]/connexion/invitation?jeton=… : « Rejoindre le foyer » (story A3, ADR 0045). Le lien
// arrive dans la boîte mail de la personne invitée : pas besoin d'être connecté.
export default async function InvitationPage({ searchParams }: Props) {
  const { jeton = "" } = await searchParams;
  const details = await getInvitationDetails(getDatabase(), jeton);
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
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title", { household: details.householdName })}
      </Typography>
      <Typography sx={{ mb: 3, maxWidth: 640 }}>
        {t("intro", {
          household: details.householdName,
          amap: details.amapName,
          email: details.email,
        })}
      </Typography>
      <AcceptInvitationForm token={jeton} email={details.email} needsName={details.needsName} />
    </>
  );
}
