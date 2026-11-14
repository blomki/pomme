import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth/session";
import { captchaWidgetConfig } from "@/server/captcha";
import { LoginForm } from "@/ui/auth/LoginForm";

type Props = {
  searchParams: Promise<{ erreur?: string; deconnexion?: string; email?: string }>;
};

// [domaine]/connexion : lien magique par email, ou passkey. Aucun mot de passe.
export default async function LoginPage({ searchParams }: Props) {
  if (await getCurrentSession()) redirect("/compte");
  const { erreur, deconnexion, email } = await searchParams;
  const t = await getTranslations("Auth.login");
  const notice =
    erreur === "lien"
      ? "linkError"
      : deconnexion === "tous"
        ? "signedOutEverywhere"
        : deconnexion
          ? "signedOut"
          : undefined;
  return (
    <>
      <Typography variant="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 3 }}>{t("intro")}</Typography>
      {/* email : adresse pré-remplie depuis l'email d'invitation (story A2). */}
      <LoginForm
        notice={notice}
        captcha={captchaWidgetConfig()}
        defaultEmail={typeof email === "string" ? email.slice(0, 254) : undefined}
      />
    </>
  );
}
