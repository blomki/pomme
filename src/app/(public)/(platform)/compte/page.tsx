import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { signOutAction, signOutEverywhereAction } from "@/server/auth/actions";
import { requireSession } from "@/server/auth/session";
import { PasskeyManager } from "@/ui/auth/PasskeyManager";

// [domaine]/compte : mon compte (passkeys, déconnexion). Le profil complet viendra avec A3.
export default async function AccountPage() {
  const { user } = await requireSession();
  const t = await getTranslations("Auth.account");
  return (
    <Stack spacing={4}>
      <div>
        <Typography variant="h1" gutterBottom>
          {t("title")}
        </Typography>
        <Typography>{t("signedInAs", { email: user.email })}</Typography>
      </div>

      <PasskeyManager />

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
