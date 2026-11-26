import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import LockOutlined from "@mui/icons-material/LockOutlined";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { modeChoices } from "@/domain/spaces";
import { getAmapBySlug } from "@/server/amap";
import { getSecondFactorState } from "@/server/auth/second-factor";
import { getMyHousehold, getMyProfile, type MyHouseholdView } from "@/server/my-account";
import { listMySpaces } from "@/server/spaces";
import { ModeSelect } from "@/ui/account/ModeSelect";
import { MyHousehold } from "@/ui/account/MyHousehold";
import { ProfileForm } from "@/ui/account/ProfileForm";
import { MySpaces } from "@/ui/auth/MySpaces";
import { LinkButton } from "@/ui/navigation/LinkButton";

// [domaine]/compte : « Mon profil » (story A3, écran 8) : mode, mes informations, mon foyer,
// mes espaces ; passkeys et déconnexion sont dans « Connexion et sécurité » (/compte/securite).
export default async function ProfilePage() {
  const state = await getSecondFactorState();
  if (!state) redirect("/connexion");
  const { user, factors } = state;
  const db = getDatabase();
  const [{ amapSpaces, isProducer }, profile] = await Promise.all([
    listMySpaces(user.id),
    withAmapContext(db, { amapId: null, userId: user.id }, (tx, ctx) => getMyProfile(tx, ctx)),
  ]);
  // Un foyer par AMAP où la personne est membre.
  const households: MyHouseholdView[] = [];
  for (const space of amapSpaces.filter((s) => s.kind === "famille")) {
    const amap = await getAmapBySlug(space.amapSlug);
    if (!amap) continue;
    const home = await withAmapContext(db, { amapId: amap.id, userId: user.id }, (tx, ctx) =>
      getMyHousehold(tx, ctx, { slug: amap.slug, name: amap.name }),
    );
    if (home) households.push(home);
  }
  const groups = modeChoices(amapSpaces);
  const t = await getTranslations("Auth.account");
  return (
    <Stack spacing={4}>
      <Typography variant="h1">{t("profileTitle")}</Typography>

      {groups.length > 0 && (
        <Stack component="section" aria-labelledby="mode" spacing={1.5}>
          <Typography id="mode" variant="h2">
            {t("modeTitle")}
          </Typography>
          <ModeSelect groups={groups} current={profile.preferredSpace} />
        </Stack>
      )}

      <Stack component="section" aria-labelledby="infos" spacing={1.5}>
        <Typography id="infos" variant="h2">
          {t("infoTitle")}
        </Typography>
        <ProfileForm profile={profile} />
      </Stack>

      {households.map((home) => (
        <MyHousehold key={home.amapSlug} household={home} />
      ))}

      <MySpaces
        spaces={amapSpaces}
        isPlatformAdmin={factors.isPlatformAdmin}
        isProducer={isProducer}
      />

      <Divider />

      <div>
        <LinkButton
          href="/compte/securite"
          startIcon={<LockOutlined />}
          endIcon={<KeyboardArrowRight />}
        >
          {t("securityLink")}
        </LinkButton>
        <Typography variant="bodySmall" color="text.secondary" component="p">
          {t("securityHint")}
        </Typography>
      </div>
    </Stack>
  );
}
