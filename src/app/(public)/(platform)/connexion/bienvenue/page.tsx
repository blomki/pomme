import Typography from "@mui/material/Typography";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { getAuth } from "@/server/auth/auth";
import { requireSession } from "@/server/auth/session";
import { PasskeyOffer } from "@/ui/auth/PasskeyOffer";

// Arrivée après un lien magique : on propose une passkey à qui n'en a pas encore.
export default async function WelcomePage() {
  const { user } = await requireSession();
  const passkeys = await getAuth().api.listPasskeys({ headers: await headers() });
  if (passkeys.length > 0) redirect("/compte");
  const t = await getTranslations("Auth.welcome");
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title", { name: user.name })}
      </Typography>
      <Typography sx={{ mb: 1 }}>{t("intro")}</Typography>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 3 }}>
        {t("explain")}
      </Typography>
      <PasskeyOffer />
    </>
  );
}
