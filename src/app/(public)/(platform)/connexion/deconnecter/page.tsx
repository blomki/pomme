import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { verifyRevokeToken } from "@/server/auth/devices";
import { RevokeDevicesForm } from "@/ui/auth/RevokeDevicesForm";

type Props = { searchParams: Promise<{ jeton?: string }> };

// [domaine]/connexion/deconnecter?jeton=… : lien de l'email d'alerte de connexion (story S10,
// ADR 0041). Demande confirmation avant de fermer toutes les sessions du compte.
export default async function RevokeDevicesPage({ searchParams }: Props) {
  const { jeton = "" } = await searchParams;
  const t = await getTranslations("Auth.revoke");
  const valid = verifyRevokeToken(jeton, new Date(), process.env.BETTER_AUTH_SECRET ?? "") !== null;
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      {valid ? (
        <>
          <Typography sx={{ mb: 3 }}>{t("intro")}</Typography>
          <RevokeDevicesForm token={jeton} />
        </>
      ) : (
        <Typography>{t("invalid")}</Typography>
      )}
    </>
  );
}
