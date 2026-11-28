import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import LockOutlined from "@mui/icons-material/LockOutlined";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { profileBackPath } from "@/domain/spaces";
import { getAmapBySlug } from "@/server/amap";
import { getSecondFactorState } from "@/server/auth/second-factor";
import { getMyHousehold, getMyProfile, type MyHouseholdView } from "@/server/my-account";
import { listMySpaces } from "@/server/spaces";
import { MyHousehold } from "@/ui/account/MyHousehold";
import { ProfileForm } from "@/ui/account/ProfileForm";
import { MySpaces } from "@/ui/auth/MySpaces";
import { SmallTopAppBar } from "@/ui/layout/SmallTopAppBar";
import { ColorModeToggle } from "@/ui/theme/ColorModeToggle";
import { LinkButton } from "@/ui/navigation/LinkButton";

// [domaine]/compte : « Mon profil » (story A3, écran 8) : mes informations, affichage, mon
// foyer, mes espaces ; passkeys et déconnexion sont dans « Connexion et sécurité » (/compte/securite).
// Le mode se choisit dans l'en-tête des espaces (fiche #126) ; la flèche « Retour » ramène à
// l'accueil du mode courant.
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
  const t = await getTranslations("Auth.account");
  return (
    <Stack spacing={4}>
      <SmallTopAppBar
        title={t("profileTitle")}
        backHref={profileBackPath(amapSpaces, profile.preferredSpace)}
      />

      <Stack component="section" aria-labelledby="infos" spacing={1.5}>
        <Typography id="infos" variant="h2">
          {t("infoTitle")}
        </Typography>
        <ProfileForm profile={profile} />
      </Stack>

      {/* Apparence (fiche #127) : réglage rare, retiré des en-têtes pour laisser la place au
          nom de l'AMAP. */}
      <Stack component="section" aria-labelledby="affichage" spacing={1.5}>
        <Typography id="affichage" variant="h2">
          {t("displayTitle")}
        </Typography>
        <Typography color="text.secondary">{t("displayHelp")}</Typography>
        <div>
          <ColorModeToggle labelledBy="affichage" />
        </div>
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
